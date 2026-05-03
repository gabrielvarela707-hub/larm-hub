/**
 * src/middleware.ts
 * Protege todas as rotas do dashboard.
 * Redireciona para /login se não houver sessão ativa.
 *
 * ⚠️  O middleware roda no Edge Runtime — sem acesso ao Zustand/sessionStorage.
 *     Usamos um cookie "hub_session" gravado no login para a checagem.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Rotas públicas (não precisam de auth)
const PUBLIC_PATHS = [
  '/login',
  '/login/santa-clara',
  '/login/larm',
  '/api',
  '/_next',
  '/favicon.ico',
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Libera rotas públicas e assets
  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p))
  if (isPublic) return NextResponse.next()

  // Verifica o cookie de sessão (definido no login)
  const session = request.cookies.get('hub_session')?.value

  if (!session) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  // Aplica o middleware a todas as rotas exceto _next e arquivos estáticos
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
