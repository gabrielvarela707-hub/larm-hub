import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Toaster } from 'react-hot-toast'
import './globals.css'

export const metadata: Metadata = {
  title: {
    template: '%s | LoteMobile',
    default: 'LoteMobile — Tecnologia para Loteamentos',
  },
  description: 'Plataforma completa de gestão de loteamentos: CRM, contratos, financeiro, mapas interativos e automações.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <html lang="pt-BR" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className={GeistSans.className}>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              borderRadius: '8px',
              fontSize: '14px',
              padding: '10px 14px',
            },
          }}
        />
      </body>
    </html>
  )
}

