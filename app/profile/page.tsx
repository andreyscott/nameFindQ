import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { signOut } from "@/app/login/actions";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const initials = user.email ? user.email.charAt(0).toUpperCase() : "U";
  const provider = user.app_metadata?.provider ?? "email";
  const createdAt = new Date(user.created_at).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <main className="min-h-screen flex items-start justify-center pt-20 sm:pt-24 md:pt-28 px-4 sm:px-6 pb-28">
      <div className="w-full max-w-sm flex flex-col gap-10">

        {/* Header */}
        <div className="text-center flex flex-col items-center gap-4">
          {/* Avatar circle */}
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-black text-white flex items-center justify-center text-3xl font-serif font-medium ring-4 ring-white shadow-md">
              {initials}
            </div>
            {/* Status dot */}
            <span className="absolute bottom-1 right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white" />
          </div>

          <div>
            <h1 className="text-2xl font-serif text-black">Account</h1>
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-black/40 mt-1">
              {user.email}
            </p>
          </div>
        </div>

        {/* Details card */}
        <div className="border border-black/10 divide-y divide-black/5">
          <div className="flex justify-between items-center px-5 py-3.5">
            <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-black/40">Email</span>
            <span className="text-[11px] font-mono text-black truncate max-w-[180px]">{user.email}</span>
          </div>
          <div className="flex justify-between items-center px-5 py-3.5">
            <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-black/40">Provider</span>
            <span className="text-[11px] font-mono text-black capitalize">{provider}</span>
          </div>
          <div className="flex justify-between items-center px-5 py-3.5">
            <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-black/40">Member since</span>
            <span className="text-[11px] font-mono text-black">{createdAt}</span>
          </div>
          <div className="flex justify-between items-center px-5 py-3.5">
            <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-black/40">Status</span>
            <span className="flex items-center gap-1.5 text-[11px] font-mono text-emerald-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
              Active
            </span>
          </div>
        </div>

        {/* Sign out */}
        <div className="flex flex-col gap-3">
          <form>
            <button
              formAction={signOut}
              className="w-full bg-black text-white px-4 py-3 text-[10px] font-mono uppercase tracking-[0.2em] hover:bg-black/80 transition-colors"
            >
              Sign Out
            </button>
          </form>
          <p className="text-center text-[9px] font-mono uppercase tracking-widest text-black/25">
            Namefinder · Monolith
          </p>
        </div>

      </div>
    </main>
  );
}
