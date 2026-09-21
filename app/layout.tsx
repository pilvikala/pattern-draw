import type { Metadata, Viewport } from 'next'
import './globals.css'
import { SessionProvider } from '@/components/SessionProvider'
import { PostHogProvider } from '@/components/PostHogProvider'
import { ToastProvider } from '@/components/ToastProvider'

export const metadata: Metadata = {
  title: 'Pattern Draw - Pixel Art Creator',
  description: 'Create pixel art patterns with customizable matrices',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>

        <SessionProvider><PostHogProvider><ToastProvider>{children}</ToastProvider></PostHogProvider></SessionProvider>
      </body>
    </html>
  )
}


