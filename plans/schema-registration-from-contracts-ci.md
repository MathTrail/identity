# Plan: Schema Registration from contracts CI (Variant A)

## Problem

Proto definitions are duplicated: source of truth lives in `contracts/proto/` but
are also inlined in `identity/infra/helm/identity-schema-registration/values.yaml`.
Every schema change or new version requires a manual update in the identity repo.

Root cause of the mentor-api crash (2026-04-20): `students.v2.StudentOnboardingReady`
was added to contracts but not registered in Apicurio → `TopicValidator` fast-failed
on startup.

## Goal

On every `push` to `main` in the contracts repo, all proto schemas are automatically
registered in Apicurio Registry via the ccompat v7 API.
The `identity-schema-registration` Helm chart is removed.

---

## Steps

### 1. Add `scripts/register-schemas.sh` to contracts repo

Shell script that:
- Iterates over every `.proto` file under `proto/`
- Extracts `package` and each `message` name (only top-level messages — no nested)
- Builds subject: `{package}.{MessageName}` (e.g. `students.v2.StudentOnboardingReady`)
- POSTs to Apicurio ccompat v7:

```
POST ${APICURIO_URL}/apis/ccompat/v7/subjects/{subject}/versions
Content-Type: application/json
{"schemaType":"PROTOBUF","schema":"<raw proto file content>"}
```

- Idempotent: ccompat v7 returns 200 if the exact schema is already registered
- Skips `common/v1/cloudevent.proto` — it's not an event schema (never consumed via Kafka directly)

Subject naming must follow the CRITICAL rule in CLAUDE.md: use ccompat v7 (NOT v2 API)
so the subject stays `{package}.{MessageName}` and not `default-{package}.{MessageName}`.

### 2. Add `ci-register-schemas` recipe to justfile

```just
ci-register-schemas:
    bash scripts/register-schemas.sh
```

### 3. Add register step to `.github/workflows/release.yml`

Add a new `register-schemas` job that runs after `test`, before or in parallel with `release`:

```yaml
register-schemas:
  needs: test
  runs-on: mathtrail-runners
  steps:
    - uses: actions/checkout@v4
    - name: Setup Environment
      uses: MathTrail/core/.github/actions/setup-env@v1
    - name: Register schemas in Apicurio
      run: just ci-register-schemas
      env:
        APICURIO_URL: ${{ vars.APICURIO_INTERNAL_URL }}
```

`APICURIO_INTERNAL_URL` — GitHub Actions variable pointing to Apicurio.
The self-hosted runner already has cluster access (it uses `skaffold build`), so
`http://streaming-apicurio-apicurio-registry.streaming.svc.cluster.local:8080`
should work directly, or via a KUBECONFIG-based port-forward if DNS is not reachable
from the runner network. Confirm which approach works and set the variable accordingly.

### 4. Update `justfile` — add local `register-schemas` recipe

For manual dev use (register from devcontainer with port-forward to Apicurio):

```just
register-schemas url="http://localhost:8081":
    APICURIO_URL="{{ url }}" bash scripts/register-schemas.sh
```

### 5. Update "Adding a New Schema" section in CLAUDE.md

Replace step 4:
```
# Before:
4. Add subject to `infra-streaming/infra/local/helm/apicurio/templates/schema-registration.yaml`

# After:
4. CI will automatically register the schema on merge to main.
   For immediate local registration: just register-schemas
```

### 6. Remove `identity-schema-registration` chart

After confirming CI registration works end-to-end:
- Delete `identity/infra/helm/identity-schema-registration/` directory
- Remove the `identity-schema-registration` entry from `identity/skaffold.yaml`

---

## Constraints & notes

- **Self-contained protos only** — no `import` in event protos, so the raw file content
  can be posted directly without Apicurio's `$ref` resolution. This is already enforced
  in contracts CLAUDE.md.
- **Idempotency** — ccompat v7 deduplicates by content hash. Re-running is safe.
- **No duplication** — after this plan, `identity-schema-registration/values.yaml`
  becomes the only place to remove; no other service repos inline proto content.
- **Ordering** — `register-schemas` must complete before any service that does a
  rolling restart (e.g. mentor-api) uses the new schema version. The release job
  dependency graph enforces this.

## Files changed

| Repo | File | Action |
|------|------|--------|
| `contracts` | `scripts/register-schemas.sh` | create |
| `contracts` | `justfile` | add `ci-register-schemas`, `register-schemas` recipes |
| `contracts` | `.github/workflows/release.yml` | add `register-schemas` job |
| `contracts` | `.claude/CLAUDE.md` | update "Adding a New Schema" step 4 |
| `identity` | `infra/helm/identity-schema-registration/` | delete (after CI confirmed) |
| `identity` | `skaffold.yaml` | remove `identity-schema-registration` release |
