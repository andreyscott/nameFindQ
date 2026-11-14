'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/utils/supabase/server'
import { siteUrl } from '@/lib/safeRedirect'
import {
  CredentialsSchema,
  SignUpSchema,
  codeForSignInError,
  codeForSignUpError,
  type AuthMessageCode,
} from '@/lib/authMessages'

function toLogin(code: AuthMessageCode): never {
  redirect(`/login?message=${code}`)
}

function readCredentials(formData: FormData) {
  return { email: formData.get('email'), password: formData.get('password') }
}

export async function login(formData: FormData) {
  const parsed = CredentialsSchema.safeParse(readCredentials(formData))
  if (!parsed.success) return toLogin('invalid_input')

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) return toLogin(codeForSignInError(error))

  revalidatePath('/', 'layout')
  redirect('/')
}

export async function signup(formData: FormData) {
  const parsed = SignUpSchema.safeParse(readCredentials(formData))
  if (!parsed.success) {
    const pw = formData.get('password')
    return toLogin(typeof pw === 'string' && pw.length > 0 && pw.length < 8 ? 'weak_password' : 'invalid_input')
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp(parsed.data)
  if (error) return toLogin(codeForSignUpError(error))

  revalidatePath('/', 'layout')
  return toLogin('check_email')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/')
}

export async function signInWithOAuth(provider: 'google' | 'apple') {
  const supabase = await createClient()
  // Built from configuration, not the request's Host header.
  const base = siteUrl((await headers()).get('host'))

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${base}/auth/callback` },
  })

  if (error || !data.url) return toLogin('auth_error')
  redirect(data.url)
}
