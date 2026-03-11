# Identity UI

A React 19 single-page application that provides the self-service interface for Ory Kratos flows: login, registration, password recovery, email verification, and OAuth2 consent.

The UI is intentionally thin — it renders whatever Kratos tells it to render. Forms are built dynamically from `ui.nodes` returned by Kratos, so no form fields are hardcoded. Adding a new field to the identity schema automatically surfaces it in the UI.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript |
| Build | Vite 6 |
| Styling | Tailwind CSS 4 + shadcn/ui |
| State | Zustand |
| Auth SDK | Ory Kratos SDK (`@ory/client`) |
| Production server | nginx alpine |

## Routes

| Path | Purpose |
|------|---------|
| `/auth/login` | Login form |
| `/auth/registration` | Registration form |
| `/auth/recovery` | Password recovery (enter email) |
| `/auth/verification` | Email verification |
| `/auth/consent` | OAuth2 consent screen (Hydra) |
| `/auth/logout` | Session logout |
| `*` | Redirect to `/auth/login` |

## Architecture

### Session initialisation

On every page load, `App.tsx` calls `useAuthStore().initialize()`, which fetches the current session from Kratos:

```
GET /api/kratos/sessions/whoami
  → 200: store session in Zustand, render app
  → 401: clear session, render app (anonymous)
```

### Same-origin proxy

Kratos must be on the same origin as the SPA for cookies to work. This is solved at two levels:

| Environment | Proxy |
|-------------|-------|
| Dev (`npm run dev`) | Vite proxy: `/api/kratos/*` → `http://localhost:4433/*` |
| Production (Kubernetes) | nginx: `/api/kratos/` → `http://kratos-public:4433/` |

The Ory SDK client is configured with `basePath: '/api/kratos'` and `withCredentials: true`.

### Dynamic form rendering

`components/ory/Node.tsx` maps a Kratos `UiNode` to a shadcn/ui component:

| UiNode type | Rendered as |
|------------|-------------|
| `input` (text/email/password) | `<Input>` + `<Label>` + validation message |
| `input` (hidden) | `<input type="hidden">` |
| `input` (submit) | `<Button>` |
| `text` | Muted paragraph |
| `anchor` | Link to `/auth/*` route |

## nginx Configuration

```nginx
server {
    listen 8080;
    root /usr/share/nginx/html;

    # Health probes (required by mathtrail-service-lib)
    location /health/startup  { return 200 '{"status":"started"}'; }
    location /health/liveness { return 200 '{"status":"ok"}'; }
    location /health/ready    { return 200 '{"status":"ready"}'; }

    # Kratos same-origin proxy
    location /api/kratos/ {
        proxy_pass http://kratos-public:4433/;
    }

    # Hydra Admin proxy (consent/logout only — not full client management)
    location ~ ^/api/hydra-admin/(admin/oauth2/auth/requests/(consent|logout)) {
        proxy_pass http://hydra-admin:4445/$1;
    }

    # SPA fallback — React Router handles all /auth/* routes
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## Container & Security

The production image runs under strict security constraints (enforced by `mathtrail-service-lib`):

| Constraint | Value |
|-----------|-------|
| User | UID 10001 (non-root) |
| Root filesystem | read-only (`readOnlyRootFilesystem: true`) |
| Writable paths | `/var/cache/nginx` and `/var/run` mounted as `emptyDir` |

The `emptyDir` volumes are declared in `infra/helm/identity-ui/values.yaml` and are required for nginx to create its temp files and PID file at runtime.

### Build (multi-stage Dockerfile)

```
Stage 1: node:20-alpine
  COPY identity-ui/package*.json
  RUN npm ci
  COPY identity-ui/
  RUN npm run build  → dist/

Stage 2: nginx:alpine
  adduser -u 10001 appuser
  COPY dist/ → /usr/share/nginx/html
  COPY nginx.conf → /etc/nginx/conf.d/default.conf
  mkdir /var/cache/nginx /var/run (owned by 10001)
  USER 10001
  EXPOSE 8080
```

## Development

### Vite dev server (fastest iteration)

```bash
cd identity-ui
npm install
npm run dev
# → http://localhost:3000
```

Requires Kratos running and port-forwarded to `localhost:4433` (e.g. via `just dev` in another terminal).

### Full stack with hot-reload

```bash
just dev
# Skaffold builds + deploys everything
# Port-forwards Identity UI to :8090, Kratos to :4433/:4434, etc.
```

## Health Checks

```bash
curl http://localhost:8090/health/ready    # → {"status":"ready"}
curl http://localhost:8090/health/liveness # → {"status":"ok"}

# Or via just:
just test
```
