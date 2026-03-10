import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { OAuth2LogoutRequest } from '@ory/client'
import { hydra } from '@/lib/hydra'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AuthLayout } from '@/components/auth/AuthLayout'

export function Logout() {
  const [searchParams] = useSearchParams()
  const [request, setRequest] = useState<OAuth2LogoutRequest | null>(null)

  const challenge = searchParams.get('logout_challenge') ?? ''

  useEffect(() => {
    if (!challenge) return
    hydra
      .getOAuth2LogoutRequest({ logoutChallenge: challenge })
      .then(({ data }) => setRequest(data))
  }, [challenge])

  if (!request) return null

  const handleAccept = async () => {
    const { data } = await hydra.acceptOAuth2LogoutRequest({ logoutChallenge: challenge })
    window.location.href = data.redirect_to
  }

  const handleReject = async () => {
    await hydra.rejectOAuth2LogoutRequest({ logoutChallenge: challenge })
    window.location.href = '/'
  }

  return (
    <AuthLayout>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Sign Out</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center">
            Do you want to sign out of your account?
          </p>
        </CardContent>
        <CardFooter className="flex gap-3 justify-end">
          <Button variant="outline" onClick={handleReject}>
            Cancel
          </Button>
          <Button onClick={handleAccept}>Sign Out</Button>
        </CardFooter>
      </Card>
    </AuthLayout>
  )
}
