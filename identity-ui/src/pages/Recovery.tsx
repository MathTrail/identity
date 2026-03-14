import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { RecoveryFlow } from '@ory/client'
import { kratos } from '@/lib/kratos'
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

export function Recovery() {
  const [searchParams] = useSearchParams()
  const [flow, setFlow] = useState<RecoveryFlow | null>(null)

  useEffect(() => {
    const flowId = searchParams.get('flow')
    if (!flowId) {
      window.location.href = '/api/kratos/self-service/recovery/browser'
      return
    }
    kratos.getRecoveryFlow({ id: flowId }).then(({ data }) => setFlow(data))
  }, [searchParams])

  if (!flow) return null

  return (
    <AuthLayout>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Account Recovery</CardTitle>
          <CardDescription>
            Enter your email to recover your account
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
            action={flow.ui.action}
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
            Back to{' '}
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
