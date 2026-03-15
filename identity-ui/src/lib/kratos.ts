import { FrontendApi, Configuration } from '@ory/client'

export const kratos = new FrontendApi(
  new Configuration({
    basePath: '/api/kratos',
    baseOptions: { withCredentials: true },
  })
)

// Kratos builds action URLs from base_url (http://localhost/api/kratos/…).
// The browser/Traefik upgrades http://localhost → https://localhost → 404.
// Strip the origin so the form submits to a relative path, which nginx proxies
// to kratos-public on the correct host (mathtrail.localhost).
export function flowActionUrl(action: string): string {
  try {
    const u = new URL(action)
    return u.pathname + u.search
  } catch {
    return action
  }
}
