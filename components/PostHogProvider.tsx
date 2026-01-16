'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import { useEffect } from 'react'
import { useSession } from 'next-auth/react'

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
      const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'

      if (posthogKey && !(posthog as any).__loaded) {
        posthog.init(posthogKey, {
          api_host: posthogHost,
          // Enable session replay
          session_recording: {
            recordCrossOriginIframes: true,
          },
          // Capture pageviews automatically
          loaded: (ph) => {
            // Expose posthog on window for utility functions
            if (typeof window !== 'undefined') {
              (window as any).posthog = ph
            }
            if (process.env.NODE_ENV === 'development') {
              // Only log in development
              console.log('PostHog initialized')
            }
          },
        })
      }
    }
  }, [])

  const { data: session } = useSession()

  // Identify users when they sign in
  useEffect(() => {
    const userId = session?.user?.id
    if (userId && typeof window !== 'undefined' && posthog && posthog.__loaded) {
      posthog.identify(userId, {
        email: session.user?.email,
        name: session.user?.name,
      })
    }
  }, [session])

  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    return <>{children}</>
  }

  return <PHProvider client={posthog}>{children}</PHProvider>
}
