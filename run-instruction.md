Полная инструкция: Запуск и работа с Observability UI
Шаг 1: Запустить стек мониторинга

# В корне проекта (root orchestrator) — запускает Grafana, Pyroscope, OTel Collector
cd d:/Projects/MathTrail/mathtrail
skaffold dev --port-forward
После запуска port-forward-ы из infra-observability/skaffold.yaml:

Сервис	URL
Grafana (прямой, без auth)	http://localhost:3000
Pyroscope (прямой, без auth)	http://localhost:4040
OTel Zipkin endpoint	http://localhost:9411
Шаг 2: Запустить Identity Stack

cd d:/Projects/MathTrail/identity
just dev
Добавляются port-forward-ы из identity/skaffold.yaml:

Сервис	URL
Identity UI (логин)	http://localhost:8090
Oathkeeper Proxy	http://localhost:4455
Oathkeeper API	http://localhost:4456
Kratos Admin	http://localhost:4434
Keto Write	http://localhost:4467
Keto Read	http://localhost:4466
Шаг 3: Создать пользователя и выдать доступ

# Создать тестового пользователя (teacher)
cd d:/Projects/MathTrail/identity
just create-test-user

# Получить UUID созданного пользователя
curl -s http://localhost:4434/admin/identities | jq '.[].id'

# Выдать доступ к мониторингу (подставить UUID)
just grant-monitoring <uuid-из-предыдущей-команды>

# Проверить что доступ выдан
just list-monitoring
Шаг 4: Войти и открыть Observability UI
Через Oathkeeper (с auth):

Открыть Identity UI: http://localhost:8090/auth/login
Войти как teacher@mathtrail.test / test1234!
Браузер получит cookie ory_kratos_session
Теперь через Oathkeeper:

UI	URL через Oathkeeper
Grafana	http://localhost:4455/observability/grafana/
Pyroscope	http://localhost:4455/observability/pyroscope/
Grafana автоматически залогинит пользователя через X-Webauth-User (auth.proxy).

Напрямую (без auth, для разработки):

UI	URL
Grafana	http://localhost:3000 (admin / mathtrail)
Pyroscope	http://localhost:4040
Управление доступом (краткая шпаргалка)

# Выдать доступ
just grant-monitoring <uuid>

# Отозвать доступ
just revoke-monitoring <uuid>

# Проверить доступ конкретного пользователя
just check-monitoring <uuid>
# → { "allowed": true }

# Посмотреть всех кто имеет доступ
just list-monitoring
Что смотреть в Grafana
После входа: Grafana → Explore →

Что	Datasource	Запрос
Трейсы mentor-api	Tempo	service.name = mentor-api
Трейсы по пользователю	Tempo	user.id = <uuid>
Логи пода	Loki	{app="mentor-api"}
Метрики	Mimir	{job="mentor-api"}
CPU профиль	Pyroscope	{app="mentor-api"}

---

Тестирование Phase 2A — Роли в Grafana (RBAC)
Oathkeeper прокидывает X-Webauth-Role на основе поля role в Kratos identity.traits.

Роли и ожидаемый результат:

Роль пользователя	X-Webauth-Role	Роль в Grafana
admin	Admin	Может управлять datasources, пользователями
mentor	Admin	Полный доступ
teacher	Editor	Может создавать дашборды, но не управлять пользователями
student (или другое)	Viewer	Только просмотр

Как проверить:

# 1. Создать пользователей с разными ролями вручную через Kratos Admin API
curl -s -X POST http://localhost:4434/admin/identities \
  -H "Content-Type: application/json" \
  -d '{
    "schema_id": "mathtrail-user",
    "traits": {
      "email": "admin@mathtrail.test",
      "name": { "first": "Admin", "last": "User" },
      "role": "admin"
    },
    "credentials": { "password": { "config": { "password": "test1234!" } } }
  }' | jq '{id: .id, role: .traits.role}'

# 2. Получить UUID admin пользователя и выдать доступ
ADMIN_UUID=$(curl -s http://localhost:4434/admin/identities | jq -r '.[] | select(.traits.role=="admin") | .id')
just grant-monitoring $ADMIN_UUID

# Или выдать доступ сразу всем admin/mentor одной командой:
just seed-monitoring

# 3. Войти в Identity UI как каждый пользователь и открыть Grafana
# http://localhost:8090/auth/login → http://localhost:4455/observability/grafana/

# 4. Проверить роль через Grafana API (токен admin/mathtrail)
curl -s http://admin:mathtrail@localhost:3000/api/org/users | jq '.[] | {login, role}'
# Ожидаем: admin@mathtrail.test → Admin, teacher@mathtrail.test → Editor

# 5. Проверить заголовок в Oathkeeper напрямую
curl -s http://localhost:4456/decisions \
  -H "X-Forwarded-Method: GET" \
  -H "X-Forwarded-Host: localhost" \
  -H "X-Forwarded-Proto: http" \
  -H "X-Forwarded-Url: /observability/grafana/" \
  -H "Cookie: ory_kratos_session=<session-token>" \
  -v 2>&1 | grep "X-Webauth-Role"
# Ожидаем: X-Webauth-Role: Admin (для admin/mentor) или Editor/Viewer

---

Тестирование Phase 2B — NetworkPolicies

# Убедиться что политики применены
kubectl get networkpolicy -n monitoring
# Ожидаем: allow-oathkeeper-ingress, allow-telemetry-ingress, allow-alloy-scrape-egress

kubectl get networkpolicy -n mathtrail
# Ожидаем: allow-oathkeeper-monitoring-egress, allow-mentor-otel-egress

# Посмотреть детали политики
kubectl describe networkpolicy allow-oathkeeper-ingress -n monitoring

# Проверить связность Oathkeeper → Grafana через политику
# (выполнить из пода Oathkeeper)
kubectl exec -n mathtrail deploy/oathkeeper -c oathkeeper -- \
  wget -qO- http://lgtm-grafana.monitoring.svc.cluster.local:80/api/health
# Ожидаем: {"commit":"...","database":"ok","version":"..."}

# Проверить связность mentor-api → OTel Collector
kubectl exec -n mathtrail deploy/mentor-api -c mentor-api -- \
  wget -qO- --timeout=3 http://otel-collector-opentelemetry-collector.monitoring.svc.cluster.local:4318/health
# Ожидаем: HTTP 200 (или connection refused только если порт закрыт политикой)

---

Тестирование Phase 2C — seed-monitoring (авто-выдача доступа)

# Посмотреть какие пользователи сейчас в системе и их роли
curl -s http://localhost:4434/admin/identities | jq '.[] | {id, email: .traits.email, role: .traits.role}'

# Выдать доступ всем admin и mentor одной командой
just seed-monitoring
# Вывод: перечислит каждого пользователя которому выдан доступ

# Убедиться что список в Keto совпадает с ожидаемым
just list-monitoring
# Вывод: список UUID всех пользователей с доступом к мониторингу

# Сравнить с реальными admin/mentor в Kratos
curl -s http://localhost:4434/admin/identities \
  | jq '[.[] | select(.traits.role == "admin" or .traits.role == "mentor") | .id]'
# Оба списка должны совпадать

# Проверить что после seed пользователь может открыть Grafana через Oathkeeper
# 1. Войти как admin@mathtrail.test через http://localhost:8090/auth/login
# 2. Открыть http://localhost:4455/observability/grafana/ — должно открыться без 401
# 3. Убедиться что роль в Grafana = Admin (Configuration → Users)

---

Проверка Oathkeeper — правила загружены

# Посмотреть все загруженные правила
curl -s http://localhost:4456/rules | jq '.[].id'
# Ожидаем:
# "mathtrail-health-rule"
# "mathtrail-auth-ui-rule"
# "mathtrail-api-rule"
# "mathtrail-grafana-rule"
# "mathtrail-pyroscope-rule"

# Проверить конкретное правило
curl -s http://localhost:4456/rules | jq '.[] | select(.id == "mathtrail-grafana-rule")'

# Проверить что 401 возвращается без сессии
curl -o /dev/null -w "%{http_code}" \
  -H "X-Forwarded-Method: GET" \
  -H "X-Forwarded-Host: localhost" \
  -H "X-Forwarded-Proto: http" \
  -H "X-Forwarded-Url: /observability/grafana/" \
  http://localhost:4456/decisions
# Ожидаем: 401

# Проверить что 403 возвращается при валидной сессии но без Keto доступа
# (пользователь есть в Kratos, но НЕ в Keto Monitoring:ui#viewer)
curl -o /dev/null -w "%{http_code}" \
  -H "X-Forwarded-Method: GET" \
  -H "X-Forwarded-Host: localhost" \
  -H "X-Forwarded-Proto: http" \
  -H "X-Forwarded-Url: /observability/grafana/" \
  -H "Cookie: ory_kratos_session=<сессия-пользователя-без-доступа>" \
  http://localhost:4456/decisions
# Ожидаем: 403
