# Identity

Identity and access management for the MathTrail platform, built on the Ory stack.
Handles authentication, sessions, OAuth2/OIDC flows, fine-grained authorization, and API gateway enforcement.

## Architecture

```mermaid
graph LR
    Browser(["Browser / Client"])

    subgraph IdentityStack ["Identity Stack (ns: identity)"]
        direction TB
        UI["Identity UI<br/>:8090"]
        OK["Oathkeeper<br/>Proxy :4455"]
        Kratos["Kratos<br/>Public :4433<br/>Admin :4434"]
        Hydra["Hydra<br/>Public :4444<br/>Admin :4445"]
        Keto["Keto<br/>Read :4466<br/>Write :4467"]

        subgraph Storage ["Data Layer"]
            direction TB
            PGB["PgBouncer<br/>:6432"] --> PG[("PostgreSQL<br/>kratos / hydra / keto")]
        end

        Kratos --> PGB
        Hydra --> PGB
        Keto --> PGB
    end

    subgraph Downstream ["Downstream Services"]
        direction TB
      DownstreamAll["Downstream Services"]
    end

    subgraph Secrets ["Secrets"]
        direction TB
        Vault["Vault"] --> ESO["ESO"]
    end

    Browser -- "self-service flows" --> UI
    UI -- "/api/kratos proxy" --> Kratos
    Browser -- "all API traffic" --> OK
    OK -- "whoami check" --> Kratos
    OK -- "authz check" --> Keto
    OK -- "proxy" --> DownstreamAll
    Hydra -- "consent UI" --> UI
    ESO -- "DSN secrets" --> Kratos & Hydra & Keto

    %% Styling
    classDef authCls fill:#b45309,stroke:#f59e0b,color:#fff
    classDef svc fill:#5b21b6,stroke:#7c3aed,color:#fff
    classDef rbacCls fill:#166534,stroke:#22c55e,color:#fff
    classDef dataCls fill:#1e3a5f,stroke:#3b82f6,color:#fff
    classDef secretCls fill:#7f1d1d,stroke:#ef4444,color:#fff
    classDef actorCls fill:#1e1b4b,stroke:#818cf8,color:#fff
    classDef dstCls fill:#1c1917,stroke:#78716c,color:#fff

    class OK,Kratos authCls
    class UI,Hydra svc
    class Keto rbacCls
    class PGB,PG dataCls
    class Vault,ESO secretCls
    class Browser actorCls
    class DownstreamAll dstCls
```

## Quick Start

```bash
just dev      # Skaffold dev loop — deploys everything + port-forward
just deploy   # One-shot deploy (no watch)
just delete   # Tear down
just status   # Pod health overview
```

## Services

| Service | Doc | Port(s) |
|---------|-----|---------|
| Ory Kratos — Identity & Sessions | [docs/kratos.md](docs/kratos.md) | 4433 (public), 4434 (admin) |
| Ory Hydra — OAuth2 / OIDC | [docs/hydra.md](docs/hydra.md) | 4444 (public), 4445 (admin) |
| Ory Keto — Permissions (ReBAC) | [docs/keto.md](docs/keto.md) | 4466 (read), 4467 (write) |
| Ory Oathkeeper — API Gateway | [docs/oathkeeper.md](docs/oathkeeper.md) | 4455 (proxy), 4456 (api) |
| Identity UI — Self-service SPA | [docs/identity-ui.md](docs/identity-ui.md) | 8090 (via port-forward) |

## Proxied Paths

All traffic enters through Traefik at `https://mathtrail.localhost` and is routed to Oathkeeper for auth enforcement.

| Path | Upstream | Auth |
|------|----------|------|
| `/health/*` | identity-ui | none |
| `/auth/*` | identity-ui | anonymous |
| `/assets/*` | identity-ui | anonymous |
| `/api/kratos/*` | identity-ui → Kratos | n/a (direct, no Oathkeeper) |
| `/api/hydra-admin/*` | identity-ui → Hydra | n/a (direct, no Oathkeeper) |
| `/api/*` | mentor-api | cookie_session or bearer_token |
| `/swagger/mentor/*` | mentor-api | cookie_session |
| `/mentor/*` | mentor-api | bearer_token + Keto ReBAC |
| `/observability/grafana/*` | lgtm-grafana.monitoring | cookie_session + `Monitoring:ui#viewer` |
| `/observability/pyroscope/*` | pyroscope.monitoring | cookie_session + `Monitoring:ui#viewer` |
| `/observability/kafka-ui*` | streaming-kafka-ui.streaming | cookie_session + `Monitoring:ui#viewer` |
| `/observability/apicurio*` | streaming-apicurio-apicurio-registry.streaming | cookie_session + `Monitoring:ui#viewer` |
| `/observability/eventcatalog*` | streaming-eventcatalog-eventcatalog-local.streaming | cookie_session + `Monitoring:ui#viewer` |
| `/observability/minio*` | streaming-minio-console.streaming | cookie_session + `Monitoring:ui#viewer` |
| `/observability/risingwave*` | risingwave-frontend-meta-headless.streaming | cookie_session + `Monitoring:ui#viewer` |
| `/observability/argocd*` | → argocd.mathtrail.localhost (redirect) | — |
| `/identity/kratos/*` | kratos-admin.identity | cookie_session + `Identity:admin#viewer` |
| `/identity/hydra/*` | hydra-admin.identity | cookie_session + `Identity:admin#viewer` |
| `/identity/keto/*` | keto-read.identity | cookie_session + `Identity:admin#viewer` |
| `/identity/oathkeeper/*` | oathkeeper-api.identity | cookie_session + `Identity:admin#viewer` |

## Granting Admin Access

Both `/observability/*` and `/identity/*` UIs require Keto relations stored in PostgreSQL —
**lost on cluster rebuild**, re-grant after each rebuild.

**Step 1 — Log in**

Open `https://mathtrail.localhost/auth/login` and sign in with Google.

**Step 2 — Find your user ID**

Open `https://mathtrail.localhost/api/kratos/sessions/whoami` in the browser.
Copy the value of `identity.id` from the JSON response.

**Step 3 — Grant access** (requires `just dev` or port-forward to be running)

```bash
just grant-admin <identity.id>
```

Grants both `Monitoring:ui#viewer` (observability UIs) and `Identity:admin#viewer` (identity admin UIs).

After that, the following URLs are accessible:

| UI | URL |
|----|-----|
| Kafka UI | https://mathtrail.localhost/observability/kafka-ui/ |
| Apicurio Registry | https://mathtrail.localhost/observability/apicurio/ |
| EventCatalog | https://mathtrail.localhost/observability/eventcatalog/ |
| MinIO Console | https://minio.mathtrail.localhost/ (redirects from /observability/minio) |
| RisingWave Dashboard | https://risingwave.mathtrail.localhost/ (redirects from /observability/risingwave) |
| Grafana | https://mathtrail.localhost/observability/grafana/ |
| Pyroscope | https://mathtrail.localhost/observability/pyroscope/ |
| ArgoCD | https://argocd.mathtrail.localhost/ (redirects from /observability/argocd) |
| Kratos Admin API (no UI) | https://mathtrail.localhost/identity/kratos/health/alive |
| Hydra Admin API (no UI) | https://mathtrail.localhost/identity/hydra/health/alive |
| Keto Read API (no UI) | https://mathtrail.localhost/identity/keto/health/alive |
| Oathkeeper API (no UI) | https://mathtrail.localhost/identity/oathkeeper/health/alive |


## Data

Each Ory service has its own PostgreSQL database (`kratos`, `hydra`, `keto`), accessed via PgBouncer in **session mode** (required for prepared statement support).

## Secrets

Managed via HashiCorp Vault + External Secrets Operator.
Vault path: `secret/data/{env}/mathtrail-identity/`

## Infrastructure

```
values/               Ory Helm values (kratos, hydra, keto, oathkeeper)
infra/helm/           Custom Helm charts
  identity-ui/        Identity UI chart (mathtrail-service-lib based)
  identity-db-init/   DB + role initialisation job
infra/local/helm/     Local dev infrastructure
  identity-postgres/  PostgreSQL
  identity-pgbouncer/ PgBouncer
configs/              Static config files mounted into pods
  kratos/             identity.schema.json
  keto/               namespaces.ts
  oathkeeper/         access-rules.yaml
manifests/            Raw Kubernetes manifests
  network-policies.yaml
```
