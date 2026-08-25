import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import { DemoStoreProvider } from '@/lib/demo-store'
import { AuthProvider } from '@/components/auth-provider'
import { WorkspaceProvider } from '@/components/workspace-provider'

export const metadata: Metadata = {
  title: 'Ledger AI — Invoice Intelligence',
  description: 'AI-powered invoice processing and finance operations workspace',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AuthProvider><WorkspaceProvider><DemoStoreProvider>{children}</DemoStoreProvider></WorkspaceProvider></AuthProvider>
        <Analytics />
      </body>
    </html>
  )
}
