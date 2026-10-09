// The sign-in callback URL comes from the query string, so only follow it
// within this site: anything else (another origin, a javascript: URL) falls
// back to the home page. Returns an absolute URL: a bare path such as
// "//evil.example" (which "/.//evil.example" normalizes to) would be read by
// the browser as a link to another host.
export function safeCallbackUrl(callbackUrl: string | null, origin: string): string {
  const home = new URL('/', origin).href
  if (!callbackUrl) return home
  try {
    const url = new URL(callbackUrl, origin)
    return url.origin === new URL(origin).origin ? url.href : home
  } catch {
    return home
  }
}
