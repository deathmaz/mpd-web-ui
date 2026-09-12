/**
 * Cross-site WebSocket hijacking guard. Browsers attach an `Origin` header to
 * every WebSocket upgrade but apply no CORS to it, so any web page a user
 * visits could otherwise open ws://<this-server>/ws and drive MPD.
 *
 * Allowed:
 * - no Origin header (non-browser clients: curl, scripts)
 * - Origin host[:port] equal to the request's Host header (the SPA served by
 *   this server, or the Vite dev proxy which forwards the browser's Host)
 * - Origin listed in `allowed` (ALLOWED_ORIGINS, for reverse proxies that
 *   rewrite Host or a client served from another domain)
 */
export function isOriginAllowed(
  origin: string | undefined,
  host: string | undefined,
  allowed: readonly string[],
): boolean {
  if (origin === undefined) return true
  // "null" is what browsers send for sandboxed/opaque origins
  if (origin === 'null') return false

  const normalized = origin.toLowerCase().replace(/\/$/, '')
  if (allowed.some((a) => a.toLowerCase().replace(/\/$/, '') === normalized)) {
    return true
  }

  let originHost: string
  try {
    originHost = new URL(origin).host.toLowerCase()
  } catch {
    return false
  }
  return host !== undefined && originHost === host.toLowerCase()
}
