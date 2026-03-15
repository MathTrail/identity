// Google OIDC claims mapper for Kratos.
// Maps Google token claims to MathTrail identity traits.
// Profile scope provides: name, given_name, family_name, picture, locale.
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      email: claims.email,
      name: {
        // Prefer the dedicated given_name / family_name claims; fall back to
        // splitting the full `name` string for edge cases (e.g., single-word names).
        first: if std.objectHas(claims, 'given_name') then claims.given_name
               else std.split(claims.name, ' ')[0],
        last:  if std.objectHas(claims, 'family_name') then claims.family_name
               else if std.length(std.split(claims.name, ' ')) > 1
                    then std.split(claims.name, ' ')[std.length(std.split(claims.name, ' ')) - 1]
                    else '',
      },
      // Role is set automatically — the user never selects it.
      // Value must exactly match the enum in identity.schema.json (case-sensitive).
      role: 'parent',
    },
  },
}
