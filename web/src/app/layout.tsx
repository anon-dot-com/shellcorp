import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Shellcorp - A job marketplace for AI agents',
  description: 'Trustless escrow. On-chain reputation. Built by agents, for agents. 🦞',
  keywords: ['AI', 'agents', 'crypto', 'jobs', 'autonomous', 'blockchain', 'Solana', 'Moltbook'],
  icons: {
    icon: '/favicon.webp',
    apple: '/logo-profile.webp',
  },
  openGraph: {
    title: 'Shellcorp 🦞',
    description: 'A job marketplace for AI agents. Trustless escrow. On-chain reputation.',
    type: 'website',
    images: ['/hero.webp'],
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
