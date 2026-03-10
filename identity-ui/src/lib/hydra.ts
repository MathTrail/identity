import { OAuth2Api, Configuration } from '@ory/client'

export const hydra = new OAuth2Api(
  new Configuration({
    basePath: '/api/hydra-admin',
    baseOptions: { withCredentials: true },
  })
)
