// Ory Keto - Relationship-Based Access Control (ReBAC) Namespace Definitions
// Reference file for MathTrail group policies

class User implements Namespace {}

class ClassGroup implements Namespace {
  // Relationships: who belongs to the class and in what role
  related: {
    teachers: User[]
    students: User[]
  }

  // Permissions: derived from relationships
  permissions = {
    viewGrades: (ctx: Context): boolean =>
      this.related.teachers.includes(ctx.subject) ||
      this.related.students.includes(ctx.subject),

    manageStudents: (ctx: Context): boolean =>
      this.related.teachers.includes(ctx.subject),

    viewLessonPlans: (ctx: Context): boolean =>
      this.related.teachers.includes(ctx.subject) ||
      this.related.students.includes(ctx.subject)
  }
}

// Example relation tuples:
// class_group:math_101#teachers@user:uuid-teacher    (Teacher assigned to class)
// class_group:math_101#students@user:uuid-student    (Student assigned to class)
// resource:lesson_plans#view@class_group:math_101#students  (All students can view lesson plans)

class Identity implements Namespace {}

// Example relation tuples:
// Identity:admin#viewer@user:uuid-admin   (Admin user can access identity admin UIs)
