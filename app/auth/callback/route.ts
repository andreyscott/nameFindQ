import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { safeNextPath } from '@/lib/safeRedirect'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Only same-origin paths — blocks ?next=@evil.com and similar open redirects.
  const next = safeNextPath(searchParams.get('next'), origin)

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL(next, origin))
    }
  }

  return NextResponse.redirect(new URL('/login?message=auth_error', origin))
}
