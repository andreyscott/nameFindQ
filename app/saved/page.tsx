"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePersistence } from "../hooks/usePersistence";

export default function SavedPage() {
  const { savedNames, toggleSave } = usePersistence();

  return (
    <div className="min-h-screen pt-32 pb-32 px-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl mx-auto"
      >
        <div className="text-center mb-16">
          <h1 className="text-5xl md:text-7xl font-serif text-black mb-4">Saved</h1>
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-black/50">
            Your Curated Onomastic Collection
          </p>
        </div>

        {savedNames.length === 0 ? (
          /* ── Empty state ──────────────────────────────────────────── */
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-5 py-20 border border-dashed border-black/10"
          >
            {/* Bookmark outline icon */}
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-black/20"
              aria-hidden="true"
            >
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>

            <div className="text-center">
              <p className="font-serif text-2xl text-black/60 mb-1">
                Your collection is empty
              </p>
              <p className="font-mono text-[10px] tracking-[0.2em] text-black/30 uppercase">
                Save names from your search results
              </p>
            </div>

            <Link
              href="/"
              className="mt-1 inline-flex items-center px-6 py-3 text-[10px] font-mono uppercase tracking-[0.2em] text-white hover:opacity-80 transition-opacity"
              style={{ backgroundColor: '#C1694F' }}
            >
              Begin Discovering
            </Link>
          </motion.div>
        ) : (
          /* ── Name list ────────────────────────────────────────────── */
          <div className="flex flex-col">
            {savedNames
              .sort((a, b) => b.savedAt - a.savedAt)
              .map((item) => (
                <div
                  key={item.name}
                  className="group py-8 border-b border-black/10 flex justify-between items-center -mx-6 px-6 hover:bg-black/[0.02] transition-colors"
                >
                  <Link href={`/name/${encodeURIComponent(item.name)}`} className="flex-1">
                    <h2 className="text-3xl font-serif text-black mb-1 group-hover:text-black/70 transition-colors">
                      {item.name}
                    </h2>
                    {/* Phase 3: bumped from text-black/60 (was /40 before) for WCAG AA */}
                    <p className="text-xs text-black/60 font-sans">
                      {item.short_meaning}
                    </p>
                  </Link>
                  <button
                    onClick={() => toggleSave(item)}
                    className="text-[10px] font-mono uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity hover:underline"
                    style={{ color: '#C1694F' }}
                  >
                    Remove
                  </button>
                </div>
              ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
