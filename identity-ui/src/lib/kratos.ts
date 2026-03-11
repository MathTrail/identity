import { FrontendApi, Configuration } from '@ory/client'

export const kratos = new FrontendApi(
  new Configuration({
    basePath: '/api/kratos',
    baseOptions: { withCredentials: true },
  })
)
