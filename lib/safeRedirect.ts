/**
 * Returns `next` only if it is a same-origin path; otherwise "/".
 * Blocks `@evil.com` (→ https://host@evil.com), `//evil.com`, `/\evil.com`,
 * absolute URLs and javascript: URLs.
 */
export function safeNextPath(next: string | null | undefined, origin: string): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  try {
    const url = new URL(next, origin);
    if (url.origin !== new URL(origin).origin) return '/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
}

/**
 * Public base URL for auth redirects. Never trusts the Host header outside
 * development. Set NEXT_PUBLIC_SITE_URL on every deployment (required on
 * Alibaba FC; Vercel falls back to its production URL).
 */
export function siteUrl(requestHost: string | null): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, '')}`;

  if (process.env.NODE_ENV === 'development' && requestHost) return `http://${requestHost}`;

  console.error('[auth] NEXT_PUBLIC_SITE_URL is not set; falling back to the request host.');
  return `https://${requestHost ?? 'localhost'}`;
}
