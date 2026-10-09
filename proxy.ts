import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// kuvio.art serves two things at "/": the editor for people who use the app,
// and the marketing page for everyone else. The URL stays "/" either way
// (a rewrite, not a redirect), so bookmarks, share links and the sign-in
// callbacks keep pointing at the same address.

// Auth.js session cookie, with the __Secure- prefix on HTTPS and a .0/.1/...
// suffix when a large JWT is split across several cookies.
const SESSION_COOKIE = /^(__Secure-)?authjs\.session-token(\.\d+)?$/

// Query parameters the editor reads on load: a drawing shared by URL, and a
// saved drawing opened from the drawings list.
const EDITOR_PARAMS = ['drawing', 'id']

export function proxy(request: NextRequest) {
  // Only checks that a session cookie exists; a stale one just shows the
  // editor, which is harmless. The API routes still verify the session.
  const hasSession = request.cookies.getAll().some((c) => SESSION_COOKIE.test(c.name))
  const opensDrawing = EDITOR_PARAMS.some((p) => request.nextUrl.searchParams.has(p))

  if (hasSession || opensDrawing) {
    return NextResponse.next()
  }
  return NextResponse.rewrite(new URL('/welcome', request.url))
}

export const config = {
  matcher: '/',
}
