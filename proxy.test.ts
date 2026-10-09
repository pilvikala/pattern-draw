import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
// The docs call it unstable_doesProxyMatch, but this Next.js release still
// exports the matcher helper under its middleware name.
import { isRewrite, getRewrittenUrl, unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { proxy, config } from './proxy'

function request(path: string, cookies: Record<string, string> = {}) {
  const req = new NextRequest(`https://kuvio.art${path}`)
  for (const [name, value] of Object.entries(cookies)) {
    req.cookies.set(name, value)
  }
  return req
}

describe('proxy', () => {
  it('shows the marketing page to visitors without a session', () => {
    const res = proxy(request('/'))
    expect(isRewrite(res)).toBe(true)
    expect(getRewrittenUrl(res)).toBe('https://kuvio.art/welcome')
  })

  it.each([
    'authjs.session-token',
    '__Secure-authjs.session-token',
    '__Secure-authjs.session-token.0',
  ])('shows the editor when the %s cookie is present', (name) => {
    const res = proxy(request('/', { [name]: 'x' }))
    expect(isRewrite(res)).toBe(false)
  })

  it('ignores unrelated cookies', () => {
    const res = proxy(request('/', { 'authjs.csrf-token': 'x', 'authjs.callback-url': 'x' }))
    expect(isRewrite(res)).toBe(true)
  })

  it.each(['/?drawing=abc', '/?id=abc'])('shows the editor for %s without a session', (path) => {
    const res = proxy(request(path))
    expect(isRewrite(res)).toBe(false)
  })

  it('runs only on the root path', () => {
    expect(unstable_doesMiddlewareMatch({ config, url: '/' })).toBe(true)
    for (const url of ['/draw', '/drawings', '/auth/signin', '/api/drawings', '/welcome']) {
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false)
    }
  })
})
