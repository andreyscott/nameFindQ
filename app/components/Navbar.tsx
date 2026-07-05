"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/utils/supabase/client";
import type { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setProfileOpen(false);
    router.push("/");
    router.refresh();
  };

  const pages = [
    { name: "Discovery", path: "/" },
    { name: "Tree", path: "/tree" },
    { name: "Saved", path: "/saved" },
  ];

  // Generate initials from email
  const getInitials = (email: string) => {
    return email.charAt(0).toUpperCase();
  };

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-4 sm:px-6 sm:py-5 md:px-12 md:py-6 bg-white/90 backdrop-blur-md transition-all duration-300">
        {/* Left: Hamburger */}
        <button
          onClick={() => setIsOpen(true)}
          className="text-black hover:opacity-70 transition-opacity outline-none"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square">
            <line x1="3" y1="8" x2="21" y2="8"></line>
            <line x1="3" y1="16" x2="21" y2="16"></line>
          </svg>
        </button>

        {/* Center: NAMEFINDER */}
        <div className="absolute left-0 right-0 flex justify-center pointer-events-none">
          <Link href="/" className="pointer-events-auto font-serif text-base sm:text-xl tracking-[0.15em] sm:tracking-[0.2em] font-medium text-black hover:opacity-70 transition-opacity uppercase">
            Namefinder
          </Link>
        </div>

        {/* Right: Profile or Login */}
        <div className="relative" ref={dropdownRef}>
          {user ? (
            // Profile avatar button (logged in)
            <button
              onClick={() => setProfileOpen((v) => !v)}
              className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center text-xs font-mono font-medium hover:opacity-80 transition-opacity outline-none ring-1 ring-black/10"
              aria-label="Open profile menu"
            >
              {getInitials(user.email ?? "U")}
            </button>
          ) : (
            // Login link (logged out)
            <Link
              href="/login"
              className="text-[10px] font-mono uppercase tracking-[0.2em] text-black hover:opacity-50 transition-opacity"
            >
              Login
            </Link>
          )}

          {/* Profile Dropdown */}
          <AnimatePresence>
            {profileOpen && user && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="absolute right-0 top-12 w-56 bg-white border border-black/10 shadow-lg z-50"
              >
                {/* User info */}
                <div className="px-4 py-3 border-b border-black/5">
                  <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-black/40">Signed in as</p>
                  <p className="text-xs font-mono text-black truncate mt-0.5">{user.email}</p>
                </div>

                {/* Links */}
                <div className="py-1">
                  <Link
                    href="/profile"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-[11px] font-mono uppercase tracking-[0.15em] text-black hover:bg-black/5 transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    Profile
                  </Link>

                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-[11px] font-mono uppercase tracking-[0.15em] text-black hover:bg-black/5 transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Sign Out
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </nav>

      {/* Slide-out Menu Overlay */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50"
            />

            {/* Menu Panel */}
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", bounce: 0, duration: 0.4 }}
              className="fixed top-0 left-0 bottom-0 w-64 md:w-80 bg-white border-r border-black/10 z-50 p-6 flex flex-col"
            >
              <div className="flex justify-between items-center mb-8">
                <span className="font-serif text-sm tracking-[0.2em] uppercase text-black/50">Menu</span>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-black hover:opacity-50 transition-opacity"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>

              <div className="flex flex-col gap-5">
                {pages.map((page) => (
                  <Link
                    key={page.name}
                    href={page.path}
                    onClick={() => setIsOpen(false)}
                    className="font-serif text-2xl text-black hover:opacity-50 transition-opacity"
                  >
                    {page.name}
                  </Link>
                ))}
              </div>

              {/* Auth section — anchored below nav links, always visible */}
              <div className="mt-8 pt-5 border-t border-black/10">
                {user ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-black/30 truncate mb-1">{user.email}</p>
                    <Link
                      href="/profile"
                      onClick={() => setIsOpen(false)}
                      className="font-serif text-xl text-black hover:opacity-50 transition-opacity"
                    >
                      Profile
                    </Link>
                    <button
                      onClick={() => { handleSignOut(); setIsOpen(false); }}
                      className="text-left font-serif text-xl text-black/50 hover:opacity-50 transition-opacity"
                    >
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <Link
                    href="/login"
                    onClick={() => setIsOpen(false)}
                    className="font-serif text-xl text-black hover:opacity-50 transition-opacity"
                  >
                    Login
                  </Link>
                )}
              </div>

            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
