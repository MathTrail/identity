// Mock OIDC claims mapper for load testing (navikt/mock-oauth2-server).
// The server sets login_hint as the sub claim; email is not a separate field.
local claims = std.extVar('claims');

{
  identity: {
    traits: {
      email: claims.sub + '@mathtrail.test',
      name: {
        first: 'Load',
        last: 'Test',
      },
      role: 'parent',
    },
  },
}
