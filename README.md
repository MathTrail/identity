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
        MentorAPI["mentor-api"]
        Grafana["Grafana"]
        Pyroscope["Pyroscope"]
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
    OK -- "proxy" --> MentorAPI
    OK -- "proxy + X-Webauth-*" --> Grafana
    OK -- "proxy" --> Pyroscope
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
    class MentorAPI,Grafana,Pyroscope dstCls
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
