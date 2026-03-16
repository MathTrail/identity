import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { LoginFlow } from '@ory/client'
import { kratos, flowActionUrl } from '@/lib/kratos'
import { useAuthStore } from '@/store/auth'
import { Node } from '@/components/ory/Node'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { Button } from '@/components/ui/button'

export function Login() {
  const [searchParams] = useSearchParams()
  const [flow, setFlow] = useState<LoginFlow | null>(null)
  const session = useAuthStore((s) => s.session)
  const initialized = useAuthStore((s) => s.initialized)

  useEffect(() => {
    if (!initialized) return
    if (session) return
    const flowId = searchParams.get('flow')
    if (!flowId) {
      window.location.href = '/api/kratos/self-service/login/browser'
      return
    }
    kratos.getLoginFlow({ id: flowId })
      .then(({ data }) => setFlow(data))
      .catch(() => {
        window.location.href = '/api/kratos/self-service/login/browser'
      })
  }, [searchParams, session, initialized])

  if (session) {
    const handleLogout = async () => {
      try {
        const { data } = await kratos.createBrowserLogoutFlow()
        window.location.href = flowActionUrl(data.logout_url)
      } catch {
        window.location.href = '/auth/login'
      }
    }
    return (
      <AuthLayout>
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Already signed in</CardTitle>
            <CardDescription>
              {session.identity?.traits?.email}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={handleLogout} variant="outline">Sign out</Button>
          </CardContent>
        </Card>
      </AuthLayout>
    )
  }

  if (!flow) return null

  return (
    <AuthLayout>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Sign In</CardTitle>
          <CardDescription>
            Sign in to your MathTrail account
          </CardDescription>
        </CardHeader>
        <CardContent>
          {flow.ui.messages?.map((msg) => (
            <p
              key={msg.id}
              className="mb-4 text-sm text-destructive"
            >
              {msg.text}
            </p>
          ))}
          <form
            action={flowActionUrl(flow.ui.action)}
            method={flow.ui.method}
            className="space-y-4"
          >
            <input type="hidden" name="upstream_parameters.prompt" value="consent" />
            {flow.ui.nodes.map((node, i) => (
              <Node key={i} node={node} />
            ))}
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            Don't have an account?{' '}
            <Link
              to="/auth/registration"
              className="text-primary underline-offset-4 hover:underline"
            >
              Sign up
            </Link>
          </p>
        </CardFooter>
      </Card>
    </AuthLayout>
  )
}
