# Ory Kratos — Identity & Session Management

Kratos manages the full user lifecycle: registration, login, password recovery, email verification, and profile settings. It stores identity data and issues session cookies consumed by the rest of the stack.

Kratos does **not** issue OAuth2 tokens — that is Hydra's job. Kratos only answers: "Who is this person, and do they have an active session?"

## Identity Schema

Every user in MathTrail has the following traits (defined in `configs/kratos/identity.schema.json`):

| Trait | Type | Required | Notes |
|-------|------|----------|-------|
| `email` | string (email) | yes | Primary identifier for password login, recovery, and verification |
| `name.first` | string | no | |
| `name.last` | string | no | |
| `role` | enum | yes | `student`, `teacher`, `admin`, `mentor` |
| `school_context.school_id` | string | yes | |
| `school_context.class_id` | string | no | |

The schema is mounted into the Kratos pod from a Helm values ConfigMap (`values/kratos-values.yaml` → `identitySchemas`).

## Self-Service Flows

All flows are driven by Kratos-generated `ui.nodes` — Identity UI renders them dynamically via `Node.tsx`, never hardcoded forms.

| Flow | Entry URL | Notes |
|------|-----------|-------|
| Login | `/auth/login` | Cookie-based session on success |
| Registration | `/auth/registration` | Creates session immediately after (post-password session hook) |
| Recovery | `/auth/recovery` | Sends recovery link to email |
| Verification | `/auth/verification` | Sends verification link to email |
| Settings | `/auth/settings` | Change password or profile traits |
| Logout | `/auth/logout` | Invalidates session cookie |

## Endpoints

### Public API — port 4433

Used by browsers and Identity UI. Requires no auth credentials — access is controlled by sessions and CSRF tokens.

```
GET  /self-service/login/browser       → initiate login flow
GET  /self-service/registration/browser
GET  /self-service/recovery/browser
GET  /self-service/verification/browser
GET  /self-service/settings/browser
POST /self-service/login               → submit login form
POST /self-service/registration
POST /self-service/recovery
POST /self-service/logout
GET  /sessions/whoami                  → inspect current session (used by Oathkeeper)
```

### Admin API — port 4434

No authentication required — **never expose this port externally**. Used by backend services and `just` recipes.

```
GET    /admin/identities               → list all users
POST   /admin/identities               → create user
GET    /admin/identities/{id}          → get user
PUT    /admin/identities/{id}          → update user
DELETE /admin/identities/{id}          → delete user
POST   /admin/recovery/link            → generate recovery link
GET    /admin/sessions                 → list active sessions
DELETE /admin/sessions/{id}            → invalidate session
```

## Admin Operations

### List all identities
```bash
curl -s http://localhost:4434/admin/identities | \
  jq '.[] | {id, email: .traits.email, role: .traits.role}'
```

### Create identity
```bash
curl -s -X POST http://localhost:4434/admin/identities \
  -H "Content-Type: application/json" \
  -d '{
    "schema_id": "mathtrail-user",
    "traits": {
      "email": "teacher@mathtrail.test",
      "name": { "first": "Test", "last": "Teacher" },
      "role": "teacher",
      "school_context": { "school_id": "school-1", "class_id": "math-101" }
    },
    "credentials": {
      "password": { "config": { "password": "test1234!" } }
    }
  }' | jq '{id: .id, email: .traits.email}'
```

Or use the justfile shortcut (creates `teacher@mathtrail.test`):
```bash
just create-test-user
```

### Get identity by ID
```bash
curl -s http://localhost:4434/admin/identities/<uuid> | jq .
```

### Delete identity
```bash
curl -s -X DELETE http://localhost:4434/admin/identities/<uuid>
```

### Generate recovery link (bypass email)
```bash
curl -s -X POST http://localhost:4434/admin/recovery/link \
  -H "Content-Type: application/json" \
  -d '{"identity_id": "<uuid>"}' | jq .recovery_link
```

### Inspect current session (as browser)
```bash
curl -s http://localhost:4433/sessions/whoami \
  -H "Cookie: ory_kratos_session=<token>" | jq '{id: .id, identity: .identity.traits}'
```

## Dev Config Notes

- **Automigration**: runs as a Kubernetes `Job` before Kratos starts (`automigration.type: job`)
- **Database**: connects via PgBouncer (`identity-postgres-pgbouncer.identity:6432/kratos`) in **session pool mode** — required because the pgx driver uses prepared statements
- **DSN**: `postgres://mathtrail:mathtrail@identity-postgres-pgbouncer.identity:6432/kratos?sslmode=disable`
