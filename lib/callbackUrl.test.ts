import { describe, it, expect } from 'vitest'
import { safeCallbackUrl } from './callbackUrl'

const ORIGIN = 'https://kuvio.art'

describe('safeCallbackUrl', () => {
  it('keeps paths on this site', () => {
    expect(safeCallbackUrl('/?id=abc', ORIGIN)).toBe('https://kuvio.art/?id=abc')
    expect(safeCallbackUrl('/drawings', ORIGIN)).toBe('https://kuvio.art/drawings')
    expect(safeCallbackUrl('https://kuvio.art/draw#x', ORIGIN)).toBe('https://kuvio.art/draw#x')
  })

  it.each([
    null,
    '',
    'https://evil.example/',
    '//evil.example',
    '///evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
  ])('falls back to the home page for %j', (input) => {
    expect(safeCallbackUrl(input, ORIGIN)).toBe('https://kuvio.art/')
  })

  it('never yields a URL on another host', () => {
    // "/.//evil.example" stays same-origin but normalizes to the path
    // "//evil.example", which a browser would treat as another host.
    const url = safeCallbackUrl('/.//evil.example', ORIGIN)
    expect(new URL(url).host).toBe('kuvio.art')
  })
})
