import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { FlowError } from '@ory/client'
import { kratos } from '@/lib/kratos'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AuthLayout } from '@/components/auth/AuthLayout'

export function Error() {
  const [searchParams] = useSearchParams()
  const [error, setError] = useState<FlowError | null>(null)

  useEffect(() => {
    const id = searchParams.get('id')
    if (!id) return
    kratos.getFlowError({ id }).then(({ data }) => setError(data))
  }, [searchParams])

  const message =
    (error?.error as { reason?: string; message?: string } | undefined)
      ?.reason ??
    (error?.error as { message?: string } | undefined)?.message ??
    'An unexpected error occurred.'

  return (
    <AuthLayout>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl text-destructive">Something went wrong</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">{message}</p>
          <Link to="/auth/login" className="text-sm text-primary underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    </AuthLayout>
  )
}
