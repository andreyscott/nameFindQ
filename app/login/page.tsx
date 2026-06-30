import { login, signup, signInWithOAuth, signOut } from './actions'
import { createClient } from '@/utils/supabase/server'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ message: string }>
}) {
  const { message } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-20 px-6">
        <div className="w-full max-w-sm flex flex-col gap-8 text-center">
          <h1 className="text-3xl font-serif text-black mb-2">Account</h1>
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-black/50">
            Signed in as {user.email}
          </p>
          <form>
            <button
              formAction={signOut}
              className="w-full bg-black text-white px-4 py-3 text-[10px] font-mono uppercase tracking-[0.2em] hover:bg-black/80 transition-colors"
            >
              Sign Out
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center pt-16 sm:pt-20 px-4 sm:px-6 pb-28">
      <div className="w-full max-w-sm flex flex-col gap-8">

        <div className="text-center">
          <h1 className="text-3xl font-serif text-black mb-2">Access Portal</h1>
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-black/50">
            Authenticate to sync your onomastic records
          </p>
        </div>

        {message && (
          <div className="bg-black/5 text-black p-4 text-center text-[10px] font-mono tracking-widest border border-black/10">
            {message}
          </div>
        )}

        <form className="flex-1 flex flex-col w-full justify-center gap-4 text-black">
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-mono uppercase tracking-[0.1em]" htmlFor="email">
              Email
            </label>
            <input
              className="bg-transparent border border-black px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-black placeholder:text-black/30"
              name="email"
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-mono uppercase tracking-[0.1em]" htmlFor="password">
              Password
            </label>
            <input
              className="bg-transparent border border-black px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-black placeholder:text-black/30"
              type="password"
              name="password"
              placeholder="••••••••"
              required
            />
          </div>

          <div className="flex flex-col gap-3 mt-4">
            <button
              formAction={login}
              className="w-full bg-black text-white px-4 py-3 text-[10px] font-mono uppercase tracking-[0.2em] hover:bg-black/80 transition-colors"
            >
              Sign In
            </button>
            <button
              formAction={signup}
              className="w-full bg-transparent text-black border border-black px-4 py-3 text-[10px] font-mono uppercase tracking-[0.2em] hover:bg-black/5 transition-colors"
            >
              Sign Up
            </button>
          </div>
        </form>

        <div className="relative flex items-center justify-center mt-2 mb-2">
          <div className="absolute border-b border-black/10 w-full" />
          <span className="bg-white px-4 text-[10px] font-mono uppercase tracking-[0.2em] text-black/40 z-10">
            OR
          </span>
        </div>

        <form className="flex justify-center gap-3">
          <button
            formAction={async () => {
              "use server";
              await signInWithOAuth("google");
            }}
            className="flex items-center justify-center gap-3 bg-transparent text-black border border-black/20 px-4 py-3 hover:bg-black/5 transition-colors"
          >
            {/* Google Icon SVG */}
            <svg viewBox="0 0 24 24" className="w-4 h-4">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
          </button>

          <button
            formAction={async () => {
              "use server";
              await signInWithOAuth("apple");
            }}
            className="flex items-center justify-center gap-3 bg-black text-white px-4 py-3 hover:bg-black/80 transition-colors"
          >
            {/* Apple Icon SVG */}
            <svg viewBox="0 0 24 24" className="w-4 h-4">
              <path fill="currentColor" d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.05 2.95.72 3.94 1.84-3.41 2.03-2.83 6.1.41 7.42-1.02 1.48-2.01 2.8-2.99 3.75zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  )
}
