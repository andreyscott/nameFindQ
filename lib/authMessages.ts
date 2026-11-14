import { z } from 'zod';

/**
 * The login page only ever shows these fixed strings, chosen by a code in the
 * `?message=` query param. Arbitrary text in the URL is ignored, so links
 * can't put phishing text on our page.
 */
export const AUTH_MESSAGES = {
  signin_required: 'Please sign in to access this page.',
  save_requires_login: 'Please sign in to save names to your collection.',
  check_email: 'Check your email to finish signing up.',
  invalid_credentials: 'Incorrect email or password.',
  email_not_confirmed: 'Please confirm your email address first.',
  invalid_input: 'Please enter a valid email address and password.',
  weak_password: 'Please choose a stronger password (at least 8 characters).',
  signup_failed: "We couldn't create that account. Try signing in instead.",
  auth_error: 'Sign-in failed. Please try again.',
} as const;

export type AuthMessageCode = keyof typeof AUTH_MESSAGES;

export function authMessage(code: string | null | undefined): string | null {
  return code && Object.hasOwn(AUTH_MESSAGES, code) ? AUTH_MESSAGES[code as AuthMessageCode] : null;
}

type SupabaseAuthError = { code?: string | null } | null | undefined;

export function codeForSignInError(error: SupabaseAuthError): AuthMessageCode {
  if (error?.code === 'invalid_credentials') return 'invalid_credentials';
  if (error?.code === 'email_not_confirmed') return 'email_not_confirmed';
  return 'auth_error';
}

/** Deliberately vague about existing accounts (no user enumeration). */
export function codeForSignUpError(error: SupabaseAuthError): AuthMessageCode {
  if (error?.code === 'weak_password') return 'weak_password';
  return 'signup_failed';
}

export const CredentialsSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()).pipe(z.string().max(254)),
  password: z.string().min(1).max(128),
});

export const SignUpSchema = CredentialsSchema.extend({
  password: z.string().min(8).max(128),
});
