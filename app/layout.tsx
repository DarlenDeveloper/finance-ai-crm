import type { Metadata } from 'next'
import { Poppins } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import { DemoStoreProvider } from '@/lib/demo-store'
import { AuthProvider } from '@/components/auth-provider'
import { WorkspaceProvider } from '@/components/workspace-provider'
import { ThemeProvider } from '@/components/theme-provider'

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Mercury Computers Limited — Invoice CRM',
  description: 'Secure invoice review, payment tracking, and customer follow-ups for Mercury Computers Limited',
  applicationName: 'Mercury Invoice CRM',
  generator: 'Next.js',
  icons: {
    icon: '/mercury-mark.png',
    apple: '/mercury-mark.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={poppins.variable}>
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          <AuthProvider><WorkspaceProvider><DemoStoreProvider>{children}</DemoStoreProvider></WorkspaceProvider></AuthProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
