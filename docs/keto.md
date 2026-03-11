# Ory Keto — Permissions & ReBAC

Keto implements the **Google Zanzibar** relation-based access control (ReBAC) model. It answers the question: _"Is subject S allowed to perform relation R on object O in namespace N?"_

Unlike RBAC, Keto stores **relation tuples** — explicit edges in a graph — rather than role assignments. This makes it ideal for hierarchical, delegatable permissions (e.g., a teacher has permission on all students in their class).

## Tuple Syntax

```
namespace:object#relation@subject
```

Examples:
```
ClassGroup:math-101#teachers@User:uuid-of-teacher
ClassGroup:math-101#students@User:uuid-of-student
Monitoring:ui#viewer@User:uuid-of-admin
```

## Namespaces in MathTrail

Defined in `configs/keto/namespaces.ts`:

### `User` (id: 0)
Base subject type. Used as the `@subject` in other namespace tuples.

### `ClassGroup` (id: 1)

| Relation | Meaning |
|----------|---------|
| `teachers` | User is a teacher of this class group |
| `students` | User is a student of this class group |

Computed permissions:
- `viewGrades` — granted to `teachers` and `students`
- `manageStudents` — granted to `teachers` only
- `viewLessonPlans` — granted to `teachers` and `students`

### `Monitoring` (id: 2)

| Relation | Meaning |
|----------|---------|
| `viewer` | User can access the observability UI (Grafana, Pyroscope) |

Oathkeeper uses this namespace to gate `/observability/grafana/` and `/observability/pyroscope/` routes.

## Endpoints

### Read API — port 4466

```
GET  /relation-tuples          → list tuples (filterable by namespace/object/relation/subject)
POST /relation-tuples/check    → check if a permission exists
POST /relation-tuples/batch/check  → check multiple permissions
GET  /expand                   → expand a subject set recursively
```

### Write API — port 4467

```
PATCH /admin/relation-tuples   → create or delete tuples (batch)
DELETE /admin/relation-tuples  → delete specific tuple
```

## Common Operations

### Check permission
```bash
curl -s -X POST http://localhost:4466/relation-tuples/check \
  -H "Content-Type: application/json" \
  -d '{
    "namespace": "Monitoring",
    "object": "ui",
    "relation": "viewer",
    "subject_id": "<user-uuid>"
  }' | jq .allowed
```

### Grant monitoring access
```bash
curl -s -X PATCH http://localhost:4467/admin/relation-tuples \
  -H "Content-Type: application/json" \
  -d '[{
    "action": "insert",
    "relation_tuple": {
      "namespace": "Monitoring",
      "object": "ui",
      "relation": "viewer",
      "subject_id": "<user-uuid>"
    }
  }]'
```

### Revoke monitoring access
```bash
curl -s -X PATCH http://localhost:4467/admin/relation-tuples \
  -H "Content-Type: application/json" \
  -d '[{
    "action": "delete",
    "relation_tuple": {
      "namespace": "Monitoring",
      "object": "ui",
      "relation": "viewer",
      "subject_id": "<user-uuid>"
    }
  }]'
```

### List all viewers for Monitoring:ui
```bash
curl -s "http://localhost:4466/relation-tuples?namespace=Monitoring&object=ui&relation=viewer" | \
  jq '.relation_tuples[].subject_id'
```

### Add class group relations
```bash
# Make a user a teacher of math-101
curl -s -X PATCH http://localhost:4467/admin/relation-tuples \
  -H "Content-Type: application/json" \
  -d '[{
    "action": "insert",
    "relation_tuple": {
      "namespace": "ClassGroup",
      "object": "math-101",
      "relation": "teachers",
      "subject_id": "<teacher-uuid>"
    }
  }]'
```

## Justfile Shortcuts

```bash
just grant-monitoring <uuid>    # insert Monitoring:ui#viewer@User:<uuid>
just revoke-monitoring <uuid>   # delete the tuple
just check-monitoring <uuid>    # POST /relation-tuples/check → {allowed: bool}
just list-monitoring            # GET all Monitoring:ui#viewer tuples
just seed-monitoring            # grant access to all admin + mentor users from Kratos
just add-test-relation          # insert a sample ClassGroup tuple for testing
```

## Dev Config Notes

- **Automigration**: runs as an `initContainer` in the Keto pod (`automigration.type: initContainer`)
- **Database**: connects via PgBouncer in session pool mode (`/keto` database)
- **Namespaces** in `values/keto-values.yaml` must match IDs defined in `configs/keto/namespaces.ts`
