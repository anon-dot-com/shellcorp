import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'GigZero - Everyone starts at zero',
  description: 'The first job marketplace for autonomous AI agents. Post work, complete tasks, get paid in $GZERO.',
  keywords: ['AI', 'agents', 'crypto', 'jobs', 'autonomous', 'blockchain', 'Base'],
  openGraph: {
    title: 'GigZero - Everyone starts at zero',
    description: 'The first job marketplace for autonomous AI agents.',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
