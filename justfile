# MathTrail Identity Stack

set shell := ["bash", "-c"]
set dotenv-load
set dotenv-path := "/etc/mathtrail/platform.env"
set export

export SKAFFOLD_DEFAULT_REPO := env_var("REGISTRY")

NAMESPACE := env_var("IDENTITY_NAMESPACE")
SERVICE := "identity-ui"
CHART_NAME := "identity-ui"

# -- Development ---------------------------------------------------------------

# One-time setup: add Helm repos and refresh local chart dependencies
setup:
    helm repo add mathtrail-charts ${CHARTS_REPO} 2>/dev/null || true
    helm repo update
    helm dep update infra/helm/identity-ui

# Start development mode with hot-reload and port-forwarding
dev: setup
    skaffold dev --port-forward

# Build and deploy to cluster (all Ory components + Identity UI)
deploy: setup
    #!/bin/bash
    set -e
    ENV_FILE="$(dirname '{{ justfile() }}')/.env"
    if [[ ! -f "$ENV_FILE" ]]; then
        echo ""
        echo "ERROR: .env not found."
        echo "Create it from the example and fill in your Google OAuth2 credentials:"
        echo ""
        echo "  cp .env.example .env"
        echo "  # then edit .env — see instructions inside"
        echo ""
        echo "Reference: $(dirname '{{ justfile() }}')/.env.example"
        exit 1
    fi
    source "$ENV_FILE"
    if [[ -z "$GOOGLE_CLIENT_ID" || "$GOOGLE_CLIENT_ID" == your-client-id* ]]; then
        echo "ERROR: GOOGLE_CLIENT_ID not set in .env"
        exit 1
    fi
    kubectl create namespace "${IDENTITY_NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -
    kubectl create secret generic identity-google-oidc-bootstrap \
        --namespace="${IDENTITY_NAMESPACE}" \
        --from-literal=GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" \
        --from-literal=GOOGLE_CLIENT_SECRET="$GOOGLE_CLIENT_SECRET" \
        --save-config --dry-run=client -o yaml | kubectl apply -f -
    skaffold run -m mathtrail-identity

# Remove everything from cluster
delete:
    skaffold delete
    kubectl delete jobs --all -n {{ NAMESPACE }} --ignore-not-found

# View Identity UI pod logs
logs:
    kubectl logs -l app.kubernetes.io/name={{ SERVICE }} -n {{ NAMESPACE }} -f

# -- Testing -------------------------------------------------------------------

# Create a test parent user via Kratos Admin API (idempotent — skips if already exists)
create-test-user:
    #!/bin/bash
    set -e
    EMAIL="parent@mathtrail.test"
    EXISTING=$(curl -s http://localhost:4434/admin/identities | jq -r --arg e "$EMAIL" '.[] | select(.traits.email==$e) | .id')
    if [[ -n "$EXISTING" ]]; then
      echo "Test user already exists (id: $EXISTING), skipping."
      exit 0
    fi
    echo "Creating test user..."
    curl -s -X POST http://localhost:4434/admin/identities \
      -H "Content-Type: application/json" \
      -d '{
        "schema_id": "mathtrail-user",
        "traits": {
          "email": "parent@mathtrail.test",
          "name": { "first": "Test", "last": "Parent" },
          "role": "parent"
        },
        "verifiable_addresses": [{
          "value": "parent@mathtrail.test",
          "via": "email",
          "status": "completed",
          "verified": true
        }]
      }' | jq .
    echo "Test user created"

# -- Monitoring Access (Keto) --------------------------------------------------

# Grant a user access to Grafana and Pyroscope via Oathkeeper
# Usage: just grant-monitoring <kratos-user-uuid>
grant-monitoring USER_ID:
    #!/bin/bash
    set -e
    echo "Granting monitoring access to {{ USER_ID }}..."
    curl -sf -X PUT http://localhost:4467/admin/relation-tuples \
      -H "Content-Type: application/json" \
      -d '{
        "namespace": "Monitoring",
        "object": "ui",
        "relation": "viewer",
        "subject_id": "{{ USER_ID }}"
      }' | jq .
    echo "Done."

# Revoke monitoring access from a user
# Usage: just revoke-monitoring <kratos-user-uuid>
revoke-monitoring USER_ID:
    #!/bin/bash
    set -e
    echo "Revoking monitoring access from {{ USER_ID }}..."
    curl -sf -X DELETE \
      "http://localhost:4467/admin/relation-tuples?namespace=Monitoring&object=ui&relation=viewer&subject_id={{ USER_ID }}"
    echo "Done."

# Check if a user has monitoring access (returns {allowed: true/false})
# Usage: just check-monitoring <kratos-user-uuid>
check-monitoring USER_ID:
    curl -sf -X POST http://localhost:4466/relation-tuples/check \
      -H "Content-Type: application/json" \
      -d '{"namespace":"Monitoring","object":"ui","relation":"viewer","subject_id":"{{ USER_ID }}"}' | jq .

# List all users with monitoring access
list-monitoring:
    curl -sf "http://localhost:4466/admin/relation-tuples?namespace=Monitoring&object=ui&relation=viewer" | jq '.relation_tuples[].subject_id'

# Auto-seed monitoring access for all admin and mentor users from Kratos
# Queries Kratos Admin API for all identities with role=admin or role=mentor
# and calls grant-monitoring for each one.
# Run this after deploying Keto with the Monitoring namespace, or after bulk user import.
seed-monitoring:
    #!/bin/bash
    set -e
    echo "Seeding monitoring access for all admin and mentor users..."
    echo ""

    # Fetch all identities from Kratos admin API (paginated, max 250 per page)
    IDENTITIES=$(curl -sf "http://localhost:4434/admin/identities?per_page=250" | jq -r '.[]')

    COUNT=0
    while IFS= read -r identity; do
        ROLE=$(echo "$identity" | jq -r '.traits.role // empty')
        USER_ID=$(echo "$identity" | jq -r '.id')
        EMAIL=$(echo "$identity" | jq -r '.traits.email // "unknown"')

        if [[ "$ROLE" == "admin" || "$ROLE" == "mentor" ]]; then
            echo "Granting monitoring access: $EMAIL ($USER_ID) [$ROLE]"
            curl -sf -X PUT http://localhost:4467/admin/relation-tuples \
              -H "Content-Type: application/json" \
              -d "{
                \"namespace\": \"Monitoring\",
                \"object\": \"ui\",
                \"relation\": \"viewer\",
                \"subject_id\": \"$USER_ID\"
              }" > /dev/null
            COUNT=$((COUNT + 1))
        fi
    done < <(curl -sf "http://localhost:4434/admin/identities?per_page=250" | jq -c '.[]')

    echo ""
    echo "Done. Granted monitoring access to $COUNT user(s)."
    echo "Run 'just list-monitoring' to verify."

# Add a Keto relation tuple (teacher -> class)
add-test-relation:
    #!/bin/bash
    set -e
    echo "Adding test relation..."
    curl -s -X PUT http://localhost:4467/admin/relation-tuples \
      -H "Content-Type: application/json" \
      -d '{
        "namespace": "ClassGroup",
        "object": "math-101",
        "relation": "teachers",
        "subject_id": "test-teacher-uuid"
      }' | jq .
    echo "Relation added"

# -- Load Testing --------------------------------------------------------------

# Bundle k6 load test scripts with esbuild
bundle-k6:
    mkdir -p tests/load/dist
    esbuild tests/load/scripts/main.js \
        --bundle \
        --format=esm \
        --external:k6 \
        --external:'k6/*' \
        --outfile=tests/load/dist/bundle.js

# Run registration load tests (dev env must already be running with mock-oauth2-server)
load-test: bundle-k6
    #!/bin/bash
    set -euo pipefail

    # Ensure k6 operator CRDs are present
    skaffold run -m identity-load-deps

    # Clean previous run
    skaffold delete -m identity-load-tests 2>/dev/null || true
    kubectl delete testrun identity-registration-load-test -n {{ NAMESPACE }} --ignore-not-found 2>/dev/null || true

    # Deploy TestRun + ConfigMap
    skaffold run -m identity-load-tests

    # Wait for TestRun to appear (k6-operator creates it asynchronously)
    echo "Waiting for TestRun..."
    for i in $(seq 1 30); do
        kubectl get testrun identity-registration-load-test -n {{ NAMESPACE }} &>/dev/null && break
        sleep 1
    done

    # Stream logs in background
    echo "Test is running..."
    kubectl logs -l k6_cr=identity-registration-load-test -n {{ NAMESPACE }} \
        --all-containers --prefix -f 2>/dev/null &
    LOGS_PID=$!

    # Wait for finish
    kubectl wait testrun identity-registration-load-test -n {{ NAMESPACE }} \
        --for=jsonpath='{.status.stage}'=finished --timeout=600s 2>/dev/null || true
    sleep 2
    kill $LOGS_PID 2>/dev/null || true

    echo ""
    echo "Checking results..."
    FAILED=$(kubectl get jobs -n {{ NAMESPACE }} -l k6_cr=identity-registration-load-test \
        -o jsonpath='{.items[?(@.status.failed>0)].metadata.name}' 2>/dev/null)
    if [ -n "$FAILED" ]; then
        echo "Load test FAILED"
        skaffold delete -m identity-load-tests
        exit 1
    fi
    echo "Load test PASSED"
    skaffold delete -m identity-load-tests

# Test Identity UI endpoints
test:
    #!/bin/bash
    set -e
    echo "Testing Identity UI..."
    echo ""
    echo "Testing /health/ready..."
    curl -s http://localhost:8090/health/ready | jq .
    echo ""
    echo "Testing /auth/login (HTTP status)..."
    curl -s -o /dev/null -w "%{http_code}" http://localhost:8090/auth/login
    echo ""

# -- Chart Release -------------------------------------------------------------

# Package and push chart to OCI registry
release-chart:
    #!/bin/bash
    set -euo pipefail
    CHART_DIR="infra/helm/{{ CHART_NAME }}"
    VERSION=$(grep '^version:' "$CHART_DIR/Chart.yaml" | awk '{print $2}')
    echo "Packaging {{ CHART_NAME }} v${VERSION}..."
    helm package "$CHART_DIR" --destination /tmp/mathtrail-charts
    HELM_REGISTRY_INSECURE_SKIP_TLS_VERIFY=true \
        helm push "/tmp/mathtrail-charts/{{ CHART_NAME }}-${VERSION}.tgz" \
        oci://${REGISTRY}/charts
    echo "Pushed {{ CHART_NAME }}:${VERSION} to oci://${REGISTRY}/charts"

# -- Terraform -----------------------------------------------------------------

# Initialize Terraform for an environment
tf-init ENV:
    cd infra/terraform/environments/{{ ENV }} && terraform init

# Plan Terraform changes
tf-plan ENV:
    cd infra/terraform/environments/{{ ENV }} && terraform plan

# Apply Terraform changes
tf-apply ENV:
    cd infra/terraform/environments/{{ ENV }} && terraform apply

# -- On-prem Node Preparation -------------------------------------------------

# Prepare an Ubuntu node for on-prem deployment
prepare-node IP:
    cd infra/ansible && ansible-playbook \
        -i "{{ IP }}," \
        playbooks/setup.yml
