'use client'

import { usePostHog } from 'posthog-js/react'

/**
 * Hook to use PostHog for tracking events
 * 
 * Example usage:
 * ```tsx
 * const posthog = usePostHog()
 * posthog?.capture('drawing_saved', { drawing_id: '123' })
 * ```
 */
export { usePostHog }

/**
 * Track a custom event (can be used outside of React components)
 * 
 * Example usage:
 * ```ts
 * import { trackEvent } from '@/lib/posthog'
 * trackEvent('drawing_created', { pattern: 'squares', size: '20x20' })
 * ```
 */
export function trackEvent(eventName: string, properties?: Record<string, any>) {
  if (typeof window !== 'undefined') {
    const posthog = (window as any).posthog
    if (posthog) {
      posthog.capture(eventName, properties)
    }
  }
}
