import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, Instrument_Sans, DM_Mono } from 'next/font/google'
import './globals.css'
import { SessionProvider } from '@/components/SessionProvider'
import { PostHogProvider } from '@/components/PostHogProvider'
import { ToastProvider } from '@/components/ToastProvider'

// Brand typefaces: Bricolage Grotesque for display, Instrument Sans for text,
// DM Mono for data (grid sizes, color codes, counts).
const displayFont = Bricolage_Grotesque({
  subsets: ['latin', 'latin-ext'],
  axes: ['opsz'],
  variable: '--font-bricolage',
  display: 'swap',
})
const textFont = Instrument_Sans({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-instrument',
  display: 'swap',
})
const monoFont = DM_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500'],
  variable: '--font-dm-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Kuvio - Pattern Designer',
  description: 'Design patterns on square or brick grids, bead by bead, row by row.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#F3F2EE',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${displayFont.variable} ${textFont.variable} ${monoFont.variable}`}>
      <body>
        <SessionProvider><PostHogProvider><ToastProvider>{children}</ToastProvider></PostHogProvider></SessionProvider>
      </body>
    </html>
  )
}


