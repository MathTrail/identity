import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { RegistrationFlow } from '@ory/client'
import { kratos, flowActionUrl } from '@/lib/kratos'
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

export function Registration() {
  const [searchParams] = useSearchParams()
  const [flow, setFlow] = useState<RegistrationFlow | null>(null)

  useEffect(() => {
    const flowId = searchParams.get('flow')
    if (!flowId) {
      window.location.href = '/api/kratos/self-service/registration/browser'
      return
    }
    kratos
      .getRegistrationFlow({ id: flowId })
      .then(({ data }) => setFlow(data))
  }, [searchParams])

  if (!flow) return null

  return (
    <AuthLayout>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Create Account</CardTitle>
          <CardDescription>
            Sign up for a MathTrail account
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
            {flow.ui.nodes.map((node, i) => (
              <Node key={i} node={node} />
            ))}
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link
              to="/auth/login"
              className="text-primary underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </AuthLayout>
  )
}
