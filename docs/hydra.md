# Ory Hydra — OAuth2 / OIDC Provider

Hydra is the OAuth2 and OpenID Connect server. It issues `access_token`, `refresh_token`, and `id_token` — but it knows **nothing about users**. When a user needs to authenticate during an OAuth2 flow, Hydra redirects to Identity UI (Kratos), which handles the actual login and then calls back to Hydra to confirm consent.

Think of Hydra as a token factory and Kratos as the identity oracle.

## OAuth2 Flows

### Authorization Code + PKCE (primary flow)

```
Client App → GET /oauth2/auth?response_type=code&client_id=...
          ← 302 redirect to Identity UI /auth/login
User logs in via Kratos
Identity UI → PUT /admin/oauth2/auth/requests/login/accept  (Hydra Admin)
          ← redirect back to /oauth2/auth
Hydra → 302 redirect to Identity UI /auth/consent
Identity UI → PUT /admin/oauth2/auth/requests/consent/accept (Hydra Admin)
          ← redirect to client redirect_uri?code=...
Client → POST /oauth2/token (exchange code for tokens)
```

### Token Refresh

```
Client → POST /oauth2/token
         grant_type=refresh_token
         refresh_token=<token>
      ← { access_token, refresh_token, id_token }
```

## Endpoints

### Public API — port 4444

Standard OAuth2/OIDC endpoints consumed by client applications.

```
GET  /oauth2/auth               → start authorization flow
POST /oauth2/token              → exchange code / refresh token
POST /oauth2/revoke             → revoke token
GET  /oauth2/introspect         → inspect token (also via Admin)
GET  /.well-known/openid-configuration  → OIDC discovery
GET  /.well-known/jwks.json     → public keys
GET  /userinfo                  → OIDC userinfo (requires bearer token)
```

### Admin API — port 4445

Used by Identity UI consent handler and backend services. **Never expose externally.**

```
GET    /admin/clients                          → list OAuth2 clients
POST   /admin/clients                          → create client
GET    /admin/clients/{id}                     → get client
PUT    /admin/clients/{id}                     → update client
DELETE /admin/clients/{id}                     → delete client
GET    /admin/oauth2/auth/requests/login       → get login request
PUT    /admin/oauth2/auth/requests/login/accept
PUT    /admin/oauth2/auth/requests/login/reject
GET    /admin/oauth2/auth/requests/consent     → get consent request
PUT    /admin/oauth2/auth/requests/consent/accept
PUT    /admin/oauth2/auth/requests/consent/reject
GET    /admin/oauth2/introspect                → inspect token
DELETE /admin/oauth2/tokens                    → revoke all tokens for client
GET    /admin/oauth2/auth/sessions/consent     → list consent sessions
DELETE /admin/oauth2/auth/sessions/consent     → revoke consent
```

## Admin Operations

### List OAuth2 clients
```bash
curl -s http://localhost:4445/admin/clients | jq '.[] | {client_id, client_name}'
```

### Create OAuth2 client (Authorization Code + PKCE)
```bash
curl -s -X POST http://localhost:4445/admin/clients \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "mathtrail-spa",
    "client_name": "MathTrail SPA",
    "grant_types": ["authorization_code", "refresh_token"],
    "response_types": ["code"],
    "scope": "openid offline profile email",
    "redirect_uris": ["http://localhost:8090/callback"],
    "token_endpoint_auth_method": "none"
  }' | jq '{client_id, client_secret}'
```

### Introspect a token
```bash
curl -s http://localhost:4445/admin/oauth2/introspect \
  -d "token=<access_token>" | jq '{active, sub, scope, exp}'
```

### List consent sessions for a user
```bash
curl -s "http://localhost:4445/admin/oauth2/auth/sessions/consent?subject=<user-uuid>" | \
  jq '.[] | {client_id: .consent_request.client.client_id, granted_scope}'
```

### Revoke all consent sessions for a user
```bash
curl -s -X DELETE \
  "http://localhost:4445/admin/oauth2/auth/sessions/consent?subject=<user-uuid>"
```

### OIDC Discovery
```bash
curl -s http://localhost:4444/.well-known/openid-configuration | jq .
```

## Dev Config Notes

- **`dev: true`** is required in `values/hydra-values.yaml` — Hydra v25.4.0 refuses to start with `http://` issuer URLs unless development mode is enabled
- **Issuer**: `http://localhost:4444` (local dev only)
- **Secret**: disabled in Helm values (`secret.enabled: false`); managed via Vault ExternalSecret `hydra-external-secret` in production
- **Automigration**: runs as a Kubernetes `Job` before Hydra starts
- **Database**: connects via PgBouncer in session pool mode (`/hydra` database)
- **Subject identifiers**: `public` mode (same `sub` claim for all clients per user)
