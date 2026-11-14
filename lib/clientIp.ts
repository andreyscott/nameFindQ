/**
 * Best-effort client IP that a caller cannot trivially spoof.
 *
 * - Vercel sets `x-real-ip` itself, so trust that first.
 * - Elsewhere (e.g. Alibaba FC), set TRUSTED_IP_HEADER to the header your
 *   gateway writes.
 * - Fallback: the right-most `x-forwarded-for` hop. A client can only prepend
 *   values, so the last hop is the one the nearest proxy added.
 */
export function getClientIp(headers: Headers): string {
  const pick = (value: string | null) => {
    if (!value) return null;
    const hops = value.split(',').map((h) => h.trim()).filter(Boolean);
    return hops.length ? hops[hops.length - 1] : null;
  };

  if (process.env.VERCEL) {
    const ip = pick(headers.get('x-real-ip')) ?? pick(headers.get('x-vercel-forwarded-for'));
    if (ip) return ip;
  }

  const trusted = process.env.TRUSTED_IP_HEADER?.trim();
  if (trusted) {
    const ip = pick(headers.get(trusted));
    if (ip) return ip;
  }

  return pick(headers.get('x-forwarded-for')) ?? pick(headers.get('x-real-ip')) ?? 'unknown';
}
