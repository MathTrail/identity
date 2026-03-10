# Implementation Plan: mathtrail-identity

## Context

The MathTrail platform needs a centralized identity and access management system. The `mathtrail-identity` repo (currently empty except LICENSE, README, plan.md) will deploy the Ory stack (Kratos, Hydra, Keto, Oathkeeper) for authentication/authorization plus a custom Identity UI Go service for login/registration forms.

This is a **hybrid** repo — part infrastructure (Ory components via remote Helm charts, like `mathtrail-infra-local`) and part custom service (Identity UI via `mathtrail-service-lib`, like `mathtrail-mentor`).

---

## Final Directory Structure

```
mathtrail-identity/
├── .devcontainer/
│   ├── devcontainer.json
│   ├── Dockerfile
│   └── post-start.sh
├── .claude/
│   └── CLAUDE.md
├── .gitignore
├── configs/                          # Authoritative config source (documentation + reference)
│   ├── kratos/
│   │   └── identity.schema.json     # User identity JSON schema
│   ├── hydra/                        # (placeholder)
│   ├── keto/
│   │   └── namespaces.ts            # ReBAC namespace definitions
│   └── oathkeeper/
│       └── access-rules.yaml        # Access rules reference
├── helm/
│   └── identity-ui/
│       ├── Chart.yaml               # Depends on mathtrail-service-lib v0.1.1
│       ├── values.yaml
│       └── templates/
│           └── main.yaml             # Includes library templates
├── identity-ui/                      # Custom Go service
│   ├── cmd/
│   │   └── main.go
│   ├── internal/
│   │   └── handler/
│   │       └── handler.go           # Login/registration/recovery handlers
│   ├── templates/                    # HTML templates
│   │   ├── login.html
│   │   ├── registration.html
│   │   └── recovery.html
│   ├── go.mod
│   └── go.sum
├── values/                           # Ory Helm chart overrides
│   ├── kratos-values.yaml
│   ├── hydra-values.yaml
│   ├── keto-values.yaml
│   └── oathkeeper-values.yaml
├── Dockerfile                        # Multi-stage build for identity-ui
├── skaffold.yaml                     # Deploys Ory infra + Identity UI
├── justfile
├── LICENSE
├── README.md
└── plan.md
```

---

## Phase 1: Repository Scaffolding

### 1.1 `.gitignore`
Based on existing repos (mathtrail-mentor, mathtrail-profile). Covers Go binaries, Helm dependency charts, IDE files, env files.

### 1.2 `.claude/CLAUDE.md`
Following `mathtrail-mentor/.claude/CLAUDE.md` pattern. Documents the hybrid architecture, key files, ports, and development workflow.

---

## Phase 2: DevContainer

### 2.1 `.devcontainer/devcontainer.json`
Based on `mathtrail-mentor/.devcontainer/devcontainer.json` with additions:

- **Base features**: Go 1.26.0, Docker-in-Docker, kubectl/helm, just
- **Added**: Ory CLI tools installed via Dockerfile
- **Ports**: 4433, 4434 (Kratos), 4444, 4445 (Hydra), 4466, 4467 (Keto), 4455, 4456 (Oathkeeper), 8080 (Identity UI)
- **Extensions**: golang.go, vscode-docker, vscode-kubernetes-tools, helm, vscode-yaml, gitlens, justfile, helm-intellisense, claude-code
- **Kubeconfig**: Host bind mount pattern from mathtrail-mentor

### 2.2 `.devcontainer/Dockerfile`
Based on `mathtrail-mentor/.devcontainer/Dockerfile` (`mcr.microsoft.com/devcontainers/base:ubuntu-24.04`), adding:
```dockerfile
# Install Ory CLI tools
RUN bash -c "curl -sL https://raw.githubusercontent.com/ory/meta/master/install.sh | sh -s -- -b /usr/local/bin kratos" \
    && bash -c "curl -sL https://raw.githubusercontent.com/ory/meta/master/install.sh | sh -s -- -b /usr/local/bin hydra" \
    && bash -c "curl -sL https://raw.githubusercontent.com/ory/meta/master/install.sh | sh -s -- -b /usr/local/bin keto" \
    && bash -c "curl -sL https://raw.githubusercontent.com/ory/meta/master/install.sh | sh -s -- -b /usr/local/bin oathkeeper"
```

### 2.3 `.devcontainer/post-start.sh`
Based on `mathtrail-mentor/.devcontainer/post-start.sh` pattern:
- Copy kubeconfig from host bind mount, rewrite `0.0.0.0` to `host.docker.internal`
- Add k3d registry to `/etc/hosts`
- Download Go dependencies (`cd identity-ui && go mod download`)
- Check cluster connectivity

---

## Phase 3: Ory Infrastructure (Helm Values + Skaffold)

### 3.1 Vendor Ory charts into `mathtrail-charts` (prerequisite)
Ory Helm charts must be vendored into the `mathtrail-charts` repo first, then referenced via `https://github.com/MathTrail/charts/charts` (same pattern as postgresql, redis).

**Changes to `mathtrail-charts/justfile`:**
- Add `helm repo add ory https://k8s.ory.sh/helm/charts 2>/dev/null || true` to the repo add section
- Add pulls under a new "Identity (Ory)" section:
  ```bash
  echo "📥 Pulling Identity (Ory) charts..."
  pull_chart kratos ory/kratos
  pull_chart hydra ory/hydra
  pull_chart keto ory/keto
  pull_chart oathkeeper ory/oathkeeper
  ```
- Run `just update` to download charts and regenerate index
- Commit and push to trigger GitHub Pages CI (`helm-repo.yml`)

### 3.2 `values/kratos-values.yaml`
- DSN: `postgres://mathtrail:mathtrail@postgres-postgresql.mathtrail:5432/kratos?sslmode=disable`
- Identity schema embedded via `identitySchemas` (email, name, role, school_context)
- Self-service flows: login, registration, recovery, verification — all pointing to Identity UI (`http://identity-ui:8080/auth/...`)
- Auto-migration enabled

### 3.3 `values/hydra-values.yaml`
- DSN: `postgres://mathtrail:mathtrail@postgres-postgresql.mathtrail:5432/hydra?sslmode=disable`
- Login/consent/logout URLs pointing to Identity UI
- Dev secret for system (to be replaced in production)
- Auto-migration enabled

### 3.4 `values/keto-values.yaml`
- DSN: `postgres://mathtrail:mathtrail@postgres-postgresql.mathtrail:5432/keto?sslmode=disable`
- Namespaces: User (id: 0), ClassGroup (id: 1)
- Read API on 4466, Write API on 4467
- Auto-migration enabled

### 3.5 `values/oathkeeper-values.yaml`
- Authenticators: bearer_token (checks Kratos sessions), anonymous, noop
- Authorizers: remote_json (queries Keto), allow
- Mutators: header (sets X-User-ID), noop
- Access rules for auth UI (anonymous), API endpoints (bearer_token + header mutator), health endpoints (noop)

### 3.6 `skaffold.yaml`
Hybrid config following both `mathtrail-infra-local` and `mathtrail-mentor` patterns:

```yaml
apiVersion: skaffold/v4beta13
kind: Config
metadata:
  name: mathtrail-identity

build:
  local:
    push: true
  insecureRegistries:
    - k3d-mathtrail-registry.localhost:5050
  artifacts:
    - image: identity-ui
      docker:
        dockerfile: Dockerfile

deploy:
  kubectl:
    defaultNamespace: mathtrail
  helm:
    releases:
      # Ory infrastructure (remote charts)
      - name: kratos
        repo: https://github.com/MathTrail/charts/charts
        remoteChart: kratos
        namespace: mathtrail
        createNamespace: true
        valuesFiles: [values/kratos-values.yaml]
        wait: true
      - name: hydra
        repo: https://github.com/MathTrail/charts/charts
        remoteChart: hydra
        namespace: mathtrail
        valuesFiles: [values/hydra-values.yaml]
        wait: true
      - name: keto
        repo: https://github.com/MathTrail/charts/charts
        remoteChart: keto
        namespace: mathtrail
        valuesFiles: [values/keto-values.yaml]
        wait: true
      - name: oathkeeper
        repo: https://github.com/MathTrail/charts/charts
        remoteChart: oathkeeper
        namespace: mathtrail
        valuesFiles: [values/oathkeeper-values.yaml]
        wait: true
      # Identity UI (custom service, library chart)
      - name: identity-ui
        chartPath: helm/identity-ui
        namespace: mathtrail
        wait: true
        setValueTemplates:
          image.repository: "{{.IMAGE_REPO_identity_ui}}"
          image.tag: "{{.IMAGE_TAG_identity_ui}}"

portForward:
  - { resourceType: service, resourceName: kratos-public, namespace: mathtrail, port: 4433, localPort: 4433 }
  - { resourceType: service, resourceName: kratos-admin, namespace: mathtrail, port: 4434, localPort: 4434 }
  - { resourceType: service, resourceName: hydra-public, namespace: mathtrail, port: 4444, localPort: 4444 }
  - { resourceType: service, resourceName: hydra-admin, namespace: mathtrail, port: 4445, localPort: 4445 }
  - { resourceType: service, resourceName: keto-read, namespace: mathtrail, port: 4466, localPort: 4466 }
  - { resourceType: service, resourceName: keto-write, namespace: mathtrail, port: 4467, localPort: 4467 }
  - { resourceType: service, resourceName: oathkeeper-proxy, namespace: mathtrail, port: 4455, localPort: 4455 }
  - { resourceType: service, resourceName: oathkeeper-api, namespace: mathtrail, port: 4456, localPort: 4456 }
  - { resourceType: service, resourceName: identity-ui, namespace: mathtrail, port: 8080, localPort: 8090 }
```

> **Note**: Ory service names (`kratos-public`, `keto-read`, etc.) may differ from what the charts actually create. Will need to verify with `kubectl get svc` after first deploy and adjust.

---

## Phase 4: Identity UI Go Service

### 4.1 `Dockerfile` (repo root)
Multi-stage build following `mathtrail-mentor/Dockerfile` exactly:
```dockerfile
FROM golang:1.25.7-alpine AS builder
# ... build from identity-ui/ subdirectory
FROM alpine:3.21
# ... non-root user (UID 10001), copy binary + templates
```

### 4.2 `helm/identity-ui/Chart.yaml`
```yaml
apiVersion: v2
name: identity-ui
version: 0.1.0
description: MathTrail Identity UI Service chart
dependencies:
  - name: mathtrail-service-lib
    version: "0.1.1"
    repository: "https://github.com/MathTrail/charts/charts"
```

### 4.3 `helm/identity-ui/values.yaml`
```yaml
image:
  repository: identity-ui
  tag: latest

env:
  - name: SERVER_PORT
    value: "8080"
  - name: KRATOS_PUBLIC_URL
    value: "http://kratos-public:4433"
  - name: HYDRA_ADMIN_URL
    value: "http://hydra-admin:4445"
  - name: BASE_URL
    value: "http://localhost:8080"
  - name: LOG_LEVEL
    value: "info"
```

### 4.4 `helm/identity-ui/templates/main.yaml`
Identical pattern to `mathtrail-mentor/helm/mathtrail-mentor/templates/main.yaml` — includes all library templates.

### 4.5 `identity-ui/cmd/main.go`
Minimal Go HTTP server with:
- **Health probes** (mandatory per mathtrail-service-lib): `/health/startup`, `/health/liveness`, `/health/ready`
- **Auth UI routes**: `/auth/login`, `/auth/registration`, `/auth/recovery`
- Handlers that proxy to Kratos self-service flows and render HTML templates

### 4.6 `identity-ui/templates/*.html`
Minimal stub HTML templates for login, registration, recovery. These will be enhanced later with proper Kratos flow integration.

---

## Phase 5: Ory Configuration Files (Reference)

### 5.1 `configs/kratos/identity.schema.json`
The JSON schema from plan.md — email (identifier), name, role (student/teacher/admin/mentor), school_context. Serves as documentation; the actual schema is embedded in `values/kratos-values.yaml`.

### 5.2 `configs/keto/namespaces.ts`
ReBAC namespace definitions: User, ClassGroup (with teachers/students relations and viewGrades permission). Reference for Keto configuration.

### 5.3 `configs/oathkeeper/access-rules.yaml`
Reference copy of the access rules embedded in `values/oathkeeper-values.yaml`.

---

## Phase 6: Justfile

Following `mathtrail-mentor/justfile` pattern with additional Ory-specific recipes:
- `setup` — add helm repos (mathtrail-charts + ory)
- `dev` — `skaffold dev --port-forward`
- `deploy` / `delete` — standard lifecycle
- `logs` / `status` — kubectl for identity-ui + all Ory pods
- `create-test-user` — import test identity via Kratos CLI
- `add-test-relation` — create Keto relation tuple

---

## Phase 8: Cross-Repo Changes

### 8.0 `mathtrail-charts/justfile` (prerequisite — must be done first)
Vendor Ory Helm charts into the chart repository:
- Add `ory` repo to `helm repo add` section
- Add `pull_chart` calls for kratos, hydra, keto, oathkeeper
- Run `just update`, commit, push to trigger GitHub Pages CI

### 8.1 `mathtrail-infra-local/skaffold.yaml` — fix strimzi chart source
Change strimzi remote chart reference from external repo to vendored mathtrail-charts:
```yaml
# Before:
- name: strimzi
  repo: https://strimzi.io/charts/
  remoteChart: strimzi-kafka-operator

# After:
- name: strimzi
  repo: https://github.com/MathTrail/charts/charts
  remoteChart: strimzi-kafka-operator
```
Strimzi is already vendored in `mathtrail-charts/justfile`, so the chart is available there.

### 8.2 `mathtrail-infra-local/values/postgresql-values.yaml`
Add `initdb.scripts` to create databases for Ory components:
```yaml
primary:
  initdb:
    scripts:
      create-identity-dbs.sql: |
        CREATE DATABASE kratos;
        CREATE DATABASE hydra;
        CREATE DATABASE keto;
```

### 8.3 `mathtrail/skaffold.yaml` (root orchestrator)
- Add `- path: ../mathtrail-identity` to default `requires` list (after infra-local, before services)
- Add `identity` profile with JSON patch
- Update `all-services` profile to include identity

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Namespace | `mathtrail` (shared) | Consistent with all existing services, simplifies DNS |
| Ory chart source | Vendored in `mathtrail-charts` | Consistent with postgres/redis pattern; referenced via `https://github.com/MathTrail/charts/charts` |
| Dockerfile location | Repo root | Matches mathtrail-mentor convention |
| Config files in `configs/` | Reference/documentation | Actual configs embedded in Helm values (Ory charts support this natively) |

---

## Verification

1. **DevContainer**: Open mathtrail-identity in VS Code, verify Ory CLI tools (`kratos version`, `hydra version`, etc.) and cluster connectivity
2. **Helm**: `helm dependency update helm/identity-ui` should pull mathtrail-service-lib
3. **Skaffold dry-run**: `skaffold render` should produce valid K8s manifests for all 5 releases
4. **Deploy**: `just deploy` should bring up all Ory components + Identity UI
5. **Health check**: `curl http://localhost:8090/health/ready` should return `{"status":"ready"}`
6. **Kratos**: `curl http://localhost:4433/health/ready` should return healthy
7. **Test user**: `just create-test-user` should create a user in Kratos
8. **Full flow**: Navigate to `http://localhost:8090/auth/login` should render the login form
