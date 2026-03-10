import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { OAuth2ConsentRequest } from '@ory/client'
import { hydra } from '@/lib/hydra'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AuthLayout } from '@/components/auth/AuthLayout'

export function Consent() {
  const [searchParams] = useSearchParams()
  const [request, setRequest] = useState<OAuth2ConsentRequest | null>(null)

  const challenge = searchParams.get('consent_challenge') ?? ''

  useEffect(() => {
    if (!challenge) return
    hydra
      .getOAuth2ConsentRequest({ consentChallenge: challenge })
      .then(({ data }) => setRequest(data))
  }, [challenge])

  if (!request) return null

  const handleAccept = async () => {
    const { data } = await hydra.acceptOAuth2ConsentRequest({
      consentChallenge: challenge,
      acceptOAuth2ConsentRequest: {
        grant_scope: request.requested_scope ?? [],
        grant_access_token_audience: request.requested_access_token_audience ?? [],
        remember: false,
      },
    })
    window.location.href = data.redirect_to
  }

  const handleReject = async () => {
    const { data } = await hydra.rejectOAuth2ConsentRequest({
      consentChallenge: challenge,
      rejectOAuth2Request: { error: 'access_denied', error_description: 'User denied access' },
    })
    window.location.href = data.redirect_to
  }

  return (
    <AuthLayout>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Authorize Access</CardTitle>
          <CardDescription>
            <strong>{request.client?.client_name ?? request.client?.client_id}</strong> is requesting
            access to your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(request.requested_scope ?? []).length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Requested permissions:</p>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                {(request.requested_scope ?? []).map((scope) => (
                  <li key={scope}>{scope}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex gap-3 justify-end">
          <Button variant="outline" onClick={handleReject}>
            Deny
          </Button>
          <Button onClick={handleAccept}>Allow</Button>
        </CardFooter>
      </Card>
    </AuthLayout>
  )
}
