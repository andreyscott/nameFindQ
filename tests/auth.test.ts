import { describe, it, expect, vi, afterEach } from 'vitest';
import { safeNextPath, siteUrl } from '../lib/safeRedirect';
import { authMessage, codeForSignInError, codeForSignUpError, CredentialsSchema } from '../lib/authMessages';

afterEach(() => vi.unstubAllEnvs());

describe('safeNextPath', () => {
  const origin = 'https://namefinder.example';
  it.each([
    ['/', '/'],
    ['/saved', '/saved'],
    ['/name/Ada?x=1#top', '/name/Ada?x=1#top'],
  ])('keeps same-origin path %s', (input, out) => expect(safeNextPath(input, origin)).toBe(out));

  it.each([
    '@evil.com',
    '//evil.com',
    '/\\evil.com',
    'https://evil.com',
    'javascript:alert(1)',
    '',
    null,
  ])('rejects %s', (input) => expect(safeNextPath(input, origin)).toBe('/'));
});

describe('siteUrl', () => {
  it('prefers NEXT_PUBLIC_SITE_URL and trims the trailing slash', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://namefinder.example/');
    expect(siteUrl('attacker.example')).toBe('https://namefinder.example');
  });
  it('uses the Vercel production URL when no site URL is set', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'namefinder-tan.vercel.app');
    expect(siteUrl('attacker.example')).toBe('https://namefinder-tan.vercel.app');
  });
  it('falls back to the request host only in development', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '');
    vi.stubEnv('NODE_ENV', 'development');
    expect(siteUrl('localhost:3000')).toBe('http://localhost:3000');
  });
});

describe('authMessage', () => {
  it('maps known codes to fixed text', () => {
    expect(authMessage('invalid_credentials')).toBe('Incorrect email or password.');
  });
  it('ignores arbitrary text from the URL (no content spoofing)', () => {
    expect(authMessage('Your account is locked. Call +1 555 0100')).toBeNull();
    expect(authMessage(undefined)).toBeNull();
  });
});

describe('error code mapping', () => {
  it('maps Supabase sign-in errors', () => {
    expect(codeForSignInError({ code: 'invalid_credentials' })).toBe('invalid_credentials');
    expect(codeForSignInError({ code: 'email_not_confirmed' })).toBe('email_not_confirmed');
    expect(codeForSignInError({ code: 'something_else' })).toBe('auth_error');
  });
  it('does not reveal whether an account exists on sign-up', () => {
    expect(codeForSignUpError({ code: 'user_already_exists' })).toBe('signup_failed');
    expect(codeForSignUpError({ code: 'weak_password' })).toBe('weak_password');
  });
});

describe('CredentialsSchema', () => {
  it('accepts a valid email and password', () => {
    expect(CredentialsSchema.safeParse({ email: 'a@b.co', password: 'secret12' }).success).toBe(true);
  });
  it('rejects a bad email or a missing password', () => {
    expect(CredentialsSchema.safeParse({ email: 'nope', password: 'secret12' }).success).toBe(false);
    expect(CredentialsSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
    expect(CredentialsSchema.safeParse({ email: null, password: null }).success).toBe(false);
  });
});
