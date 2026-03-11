# Ory Oathkeeper — API Gateway & Zero-Trust Proxy

Oathkeeper is the entry point for all API traffic in MathTrail. Every request passes through it. It evaluates **access rules** that define: how to authenticate the request, how to authorize it, and what headers to inject before forwarding to the upstream service.

If a request doesn't match any rule, or fails authentication/authorization, Oathkeeper returns `401` or `403`.

## How It Works

```
Request → Oathkeeper Proxy (:4455)
        → match access rule by URL + method
        → authenticate  (cookie_session → Kratos /whoami, or bearer_token, or anonymous)
        → authorize     (Keto check, or allow, or deny)
        → mutate        (inject X-User-ID, X-Webauth-* headers)
        → forward to upstream
```

## Access Rules

Configured in `values/oathkeeper-values.yaml` → `accessRules`, mounted into the pod as `access-rules.json`.

### 1. Health endpoints
```
URL:     <http|https>://<.*>/health/<.*>
Methods: GET
Auth:    noop (no authentication)
Authz:   allow
Mutator: noop
Upstream: identity-ui:8080
```
Health probes bypass all authentication so Kubernetes liveness/readiness checks always work.

### 2. Auth UI
```
URL:     <http|https>://<.*>/auth/<.*>
Methods: GET, POST
Auth:    anonymous (unauthenticated users allowed)
Authz:   allow
Mutator: noop
Upstream: identity-ui:8080
```
Login, registration, recovery pages must be accessible before a session exists.

### 3. Mentor API — Swagger
```
URL:     <http|https>://<.*>/swagger/mentor/<.*>
Methods: GET
Auth:    cookie_session (valid Kratos session required)
Authz:   allow
Mutator: noop
Upstream: mentor-api.mathtrail.svc.cluster.local:8080 (strip_path: /swagger/mentor)
```

### 4. Mentor API — REST endpoints
```
URL:     <http|https>://<.*>/api/<.*>
Methods: GET, POST, PUT, DELETE
Auth:    cookie_session OR bearer_token
Authz:   allow
Mutator: header → X-User-ID: {{ .Subject }}
Upstream: mentor-api.mathtrail.svc.cluster.local:8080
```
The `X-User-ID` header carries the Kratos identity UUID to the upstream service.

### 5. Grafana (observability)
```
URL:     <http|https>://<.*>/observability/grafana/<.*>
Methods: GET, POST, PUT, DELETE, PATCH
Auth:    cookie_session
Authz:   remote_json → Keto: Monitoring:ui#viewer@{subject}
Mutator: header →
  X-Webauth-User:  {{ .Extra.identity.traits.email }}
  X-User-ID:       {{ .Subject }}
  X-Webauth-Role:  Admin (admin/mentor) | Editor (teacher) | Viewer (other)
Upstream: lgtm-grafana.monitoring.svc.cluster.local:80 (strip_path: /observability/grafana)
```
Grafana uses proxy auth (`auth.proxy`) — the `X-Webauth-User` header auto-logs in the user. Role mapping is computed inline in the mutator template.

### 6. Pyroscope (observability)
```
URL:     <http|https>://<.*>/observability/pyroscope/<.*>
Methods: GET, POST
Auth:    cookie_session
Authz:   remote_json → Keto: Monitoring:ui#viewer@{subject}
Mutator: header → X-User-ID: {{ .Subject }}
Upstream: pyroscope.monitoring.svc.cluster.local:4040 (strip_path: /observability/pyroscope)
```

## Header Injection Reference

| Header | Value | Set for rules |
|--------|-------|---------------|
| `X-User-ID` | Kratos identity UUID | API, Grafana, Pyroscope |
| `X-Webauth-User` | `identity.traits.email` | Grafana |
| `X-Webauth-Role` | `Admin` / `Editor` / `Viewer` | Grafana |

Grafana role mapping:
| Kratos role | X-Webauth-Role |
|-------------|---------------|
| `admin` | `Admin` |
| `mentor` | `Admin` |
| `teacher` | `Editor` |
| `student` | `Viewer` |

## Endpoints

### Proxy — port 4455
All production traffic enters here. Oathkeeper evaluates rules and forwards or rejects.

### API — port 4456
Exposes the rule management and decision API. Used for debugging.

```
GET  /rules          → list all loaded access rules
GET  /rules/{id}     → get specific rule
POST /decisions      → evaluate a request (dry-run, no actual forwarding)
GET  /health/alive
GET  /health/ready
```

## Debugging Operations

### List all loaded rules
```bash
curl -s http://localhost:4456/rules | jq '.[].id'
```

### Inspect a specific rule
```bash
curl -s http://localhost:4456/rules | \
  jq '.[] | select(.id == "mathtrail-grafana-rule")'
```

### Check decision without a session (expect 401)
```bash
curl -o /dev/null -w "%{http_code}" \
  -H "X-Forwarded-Method: GET" \
  -H "X-Forwarded-Host: localhost" \
  -H "X-Forwarded-Proto: http" \
  -H "X-Forwarded-Url: /observability/grafana/" \
  http://localhost:4456/decisions
# → 401
```

### Check decision with a session and inspect injected headers
```bash
curl -v \
  -H "X-Forwarded-Method: GET" \
  -H "X-Forwarded-Host: localhost" \
  -H "X-Forwarded-Proto: http" \
  -H "X-Forwarded-Url: /observability/grafana/" \
  -H "Cookie: ory_kratos_session=<session-token>" \
  http://localhost:4456/decisions 2>&1 | grep -E "X-Webauth|X-User-ID|< HTTP"
# → 200 + injected headers (if user has Monitoring:ui#viewer in Keto)
# → 403 if user lacks Keto permission
```

## Config Notes

- **Rules file**: mounted from ConfigMap `oathkeeper-rules` at `/etc/rules/access-rules.json` (key is `.json`, not `.yaml` — match in `access_rules.repositories`)
- **`cookie_session.cache`**: removed in Oathkeeper v25.4.0 — do not add it to config
- **`cookie_session.only`**: `["ory_kratos_session"]` — only validates cookies with this name
- **Keto check URL**: `http://keto-read:4466/relation-tuples/check`
