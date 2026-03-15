# Identity Stack — инструкция по запуску и тестированию

## Стек

Все сервисы деплоятся в namespace **`identity`**.

k3d кластер создаётся с `--port 80:80@loadbalancer --port 443:443@loadbalancer`, поэтому Traefik доступен напрямую — port-forward для публичного трафика **не нужен**.

Публичный доступ через Traefik (без port-forward):

| Путь | Сервис |
|------|--------|
| https://mathtrail.localhost/auth/ | Identity UI |
| https://mathtrail.localhost/health/ | Identity UI (health) |
| https://mathtrail.localhost/api/ | Mentor API |
| https://mathtrail.localhost/swagger/mentor/ | Mentor API Swagger |
| https://mathtrail.localhost/observability/grafana/ | Grafana |
| https://mathtrail.localhost/observability/pyroscope/ | Pyroscope |

Административные API (Internal, port-forward автоматически через `just dev`):

| Сервис | URL |
|--------|-----|
| Kratos Admin | http://localhost:4434 |
| Hydra Public | http://localhost:4444 |
| Hydra Admin | http://localhost:4445 |
| Keto Read | http://localhost:4466 |
| Keto Write | http://localhost:4467 |
| Oathkeeper Proxy | http://localhost:4455 |
| Oathkeeper API | http://localhost:4456 |
| Identity UI (direct) | http://localhost:8090 |

> Kratos Public API проксируется через Identity UI по пути `/api/kratos/` (без port-forward).
> Корневой путь не возвращает данных — проверочный эндпоинт: `https://mathtrail.localhost/api/kratos/health/alive`
>
> Через port-forward (`just dev`) — `http://localhost:4433`.

---

## Шаг 0: Подготовка (один раз)

Перед первым деплоем нужно создать файл с Google OAuth2 credentials:

```bash
cd /home/alex/projects/mathtrail/identity
cp .env.example .env
# Открыть .env и вписать GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET
```

Google Cloud Console → Credentials → OAuth 2.0 Client ID → Web application.
Authorized redirect URI:
```
http://localhost/api/kratos/self-service/methods/oidc/callback/google
```

> Google не принимает `.localhost` как TLD. `http://localhost` — специальное исключение для local dev.

---

## Шаг 1: Запуск стека

```bash
cd /home/alex/projects/mathtrail/identity

# Задеплоить всё (включает vault seeding из .env)
just deploy

# Или запустить с hot-reload + port-forward для admin API
just dev
```

`just deploy` автоматически:
1. Проверяет наличие `.env` с credentials
2. Записывает Google credentials в Vault
3. Создаёт ConfigMap и ExternalSecret до запуска Helm
4. Запускает `skaffold run`

---

## Шаг 2: Проверка что всё поднялось

```bash
just status
kubectl get pods -n identity
```

Все поды должны быть `Running` или `Completed` (automigrate jobs).

---

## Шаг 3: Вход через Google

Аутентификация — **только через Google OAuth** (password login отключён).

1. Открыть https://mathtrail.localhost/auth/login
2. Нажать «Sign in with Google»
3. Google перенаправит на `http://localhost/api/kratos/...callback...`
4. Kratos создаст сессию и перенаправит обратно на `https://mathtrail.localhost`
5. Браузер получит cookie `ory_kratos_session` с domain `.localhost`

Новый пользователь при первом входе получает роль `parent` (задаётся в `oidc.google.jsonnet`).

---

## Шаг 4: Создать тестовую identity (для monitoring-тестов)

`create-test-user` создаёт запись identity без credentials — пользователь должен залогиниться через Google с тем же email чтобы привязать аккаунт.

```bash
# Создаёт identity parent@mathtrail.test
just create-test-user

# Создать identity с другой ролью вручную
curl -s -X POST http://localhost:4434/admin/identities \
  -H "Content-Type: application/json" \
  -d '{
    "schema_id": "mathtrail-user",
    "traits": {
      "email": "admin@mathtrail.test",
      "name": { "first": "Admin", "last": "User" },
      "role": "admin"
    }
  }' | jq '{id: .id, role: .traits.role}'

# Список всех identities
curl -s http://localhost:4434/admin/identities \
  | jq '.[] | {id, email: .traits.email, role: .traits.role}'
```

---

## Шаг 5: Выдать доступ к мониторингу

```bash
# Выдать доступ конкретному пользователю
just grant-monitoring <uuid>

# Выдать доступ сразу всем admin и mentor
just seed-monitoring

# Проверить доступ конкретного пользователя
just check-monitoring <uuid>
# → { "allowed": true }

# Посмотреть всех у кого есть доступ
just list-monitoring

# Отозвать доступ
just revoke-monitoring <uuid>
```

---

## Проверка Oathkeeper

```bash
# Все загруженные правила
curl -s http://localhost:4456/rules | jq '.[].id'

# 401 без сессии
curl -o /dev/null -w "%{http_code}" \
  -H "X-Forwarded-Method: GET" \
  -H "X-Forwarded-Host: mathtrail.localhost" \
  -H "X-Forwarded-Proto: https" \
  -H "X-Forwarded-Url: /observability/grafana/" \
  http://localhost:4456/decisions
# Ожидаем: 401

# Проверить заголовки для конкретной сессии
curl -s http://localhost:4456/decisions \
  -H "X-Forwarded-Method: GET" \
  -H "X-Forwarded-Host: mathtrail.localhost" \
  -H "X-Forwarded-Proto: https" \
  -H "X-Forwarded-Url: /observability/grafana/" \
  -H "Cookie: ory_kratos_session=<session-token>" \
  -v 2>&1 | grep "X-Webauth"
# Ожидаем: X-Webauth-Role, X-Webauth-User, X-User-ID
```

---

## Тестирование RBAC ролей в Grafana

Oathkeeper прокидывает `X-Webauth-Role` на основе `role` в Kratos `identity.traits`.

| Роль Kratos | X-Webauth-Role | Роль в Grafana |
|-------------|---------------|----------------|
| admin | Admin | Управление datasources и пользователями |
| mentor | Admin | Полный доступ |
| teacher | Editor | Создание дашбордов |
| student | Viewer | Только просмотр |

---

## Тестирование Identity UI

```bash
# Health endpoints через Traefik (без port-forward)
curl -sk https://mathtrail.localhost/health/ready   # → {"status":"ready"}
curl -sk https://mathtrail.localhost/health/liveness # → {"status":"ok"}
```

---

## NetworkPolicies

```bash
kubectl get networkpolicy -n identity

# Проверить связность Oathkeeper → Grafana
kubectl exec -n identity deploy/oathkeeper -- \
  wget -qO- http://lgtm-grafana.monitoring.svc.cluster.local:80/api/health
```

---

## Статус и логи

```bash
just status   # состояние всех podов
just logs     # логи Identity UI
kubectl logs -n identity -l app.kubernetes.io/name=kratos -f
```
