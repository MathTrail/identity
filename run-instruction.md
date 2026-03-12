# Identity Stack — инструкция по запуску и тестированию

## Стек

Все сервисы деплоятся в namespace **`identity`**.

k3d кластер создаётся с `--port 80:80@loadbalancer --port 443:443@loadbalancer`, поэтому Traefik доступен напрямую — port-forward для публичного трафика **не нужен**.

Публичный доступ через Traefik → Oathkeeper (без port-forward):

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
| Kratos Public | http://localhost:4433 |
| Kratos Admin | http://localhost:4434 |
| Hydra Public | http://localhost:4444 |
| Hydra Admin | http://localhost:4445 |
| Keto Read | http://localhost:4466 |
| Keto Write | http://localhost:4467 |
| Oathkeeper Proxy | http://localhost:4455 |
| Oathkeeper API | http://localhost:4456 |
| Identity UI (direct) | http://localhost:8090 |

---

## Шаг 1: Запуск стека

```bash
cd /home/alex/projects/mathtrail/identity

# Запустить всё с hot-reload + port-forward для admin API
just dev

# Или разово задеплоить (публичные URL через Traefik работают без port-forward)
just deploy
```

> **`just dev`** запускает `skaffold dev --port-forward`, который автоматически пробрасывает все административные порты (Kratos Admin :4434, Keto :4466/:4467 и др.) — они нужны для команд `just create-test-user`, `just grant-monitoring` и т.д.
> Публичный трафик через `https://mathtrail.localhost` работает через Traefik и не требует port-forward.

---

## Шаг 3: Создать тестового пользователя

```bash
# Создаёт teacher@mathtrail.test / test1234!
just create-test-user

# Создать пользователей с другими ролями вручную
curl -s -X POST http://localhost:4434/admin/identities \
  -H "Content-Type: application/json" \
  -d '{
    "schema_id": "mathtrail-user",
    "traits": {
      "email": "admin@mathtrail.test",
      "name": { "first": "Admin", "last": "User" },
      "role": "admin",
      "school_context": { "school_id": "school-1" }
    },
    "credentials": { "password": { "config": { "password": "test1234!" } } }
  }' | jq '{id: .id, role: .traits.role}'

# Получить UUID нужного пользователя
curl -s http://localhost:4434/admin/identities | jq '.[] | {id, email: .traits.email, role: .traits.role}'
```

---

## Шаг 4: Выдать доступ к мониторингу

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

## Шаг 5: Вход и проверка UI

1. Открыть https://mathtrail.localhost/auth/login
2. Войти как `teacher@mathtrail.test` / `test1234!`
3. Браузер получит cookie `ory_kratos_session`

Доступ через Oathkeeper (с auth):

| UI | URL |
|----|-----|
| Grafana | https://mathtrail.localhost/observability/grafana/ |
| Pyroscope | https://mathtrail.localhost/observability/pyroscope/ |

---

## Проверка Oathkeeper

```bash
# Все загруженные правила
curl -s http://localhost:4456/rules | jq '.[].id'
# Ожидаем:
# "mathtrail-health-rule"
# "mathtrail-auth-ui-rule"
# "mathtrail-mentor-swagger-rule"
# "mathtrail-api-rule"
# "mathtrail-grafana-rule"
# "mathtrail-pyroscope-rule"

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

```bash
# Проверить роли пользователей через Grafana API
curl -s http://admin:mathtrail@localhost:3000/api/org/users \
  | jq '.[] | {login, role}'
# Ожидаем: admin@mathtrail.test → Admin, teacher@mathtrail.test → Editor
```

---

## Тестирование Identity UI

```bash
# Проверить health endpoints
just test

# Или вручную (через Traefik, без port-forward)
curl -sk https://mathtrail.localhost/health/ready   # → {"status":"ready"}
curl -sk https://mathtrail.localhost/health/liveness # → {"status":"ok"}
```

---

## NetworkPolicies

```bash
# Убедиться что политики применены
kubectl get networkpolicy -n identity
# Ожидаем: allow-oathkeeper-monitoring-egress

# Проверить связность Oathkeeper → Grafana
kubectl exec -n identity deploy/oathkeeper -- \
  wget -qO- http://lgtm-grafana.monitoring.svc.cluster.local:80/api/health
# Ожидаем: {"commit":"...","database":"ok","version":"..."}
```

---

## Статус и логи

```bash
just status   # состояние всех podов
just logs     # логи Identity UI
kubectl get pods -n identity
```
