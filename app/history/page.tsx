"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePersistence } from "../hooks/usePersistence";

export default function HistoryPage() {
  const { searchHistory, clearHistory } = usePersistence();

  return (
    <div className="min-h-screen pt-32 pb-32 px-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl mx-auto"
      >
        <div className="flex justify-between items-end mb-16">
          <div>
            <h1 className="text-5xl md:text-7xl font-serif text-black mb-4">History</h1>
            <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-black/50">
              Your Onomastic Journey
            </p>
          </div>
          {searchHistory.length > 0 && (
            <button
              onClick={clearHistory}
              className="text-[10px] font-mono uppercase tracking-widest text-black/40 hover:text-black/70 transition-colors"
            >
              Clear All
            </button>
          )}
        </div>

        {searchHistory.length === 0 ? (
          /* ── Empty state ──────────────────────────────────────────── */
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-5 py-20 border border-dashed border-black/10"
          >
            {/* Clock / history icon */}
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
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>

            <div className="text-center">
              <p className="font-serif text-2xl text-black/60 mb-1">
                No searches yet
              </p>
              <p className="font-mono text-[10px] tracking-[0.2em] text-black/30 uppercase">
                Every search you make is logged here
              </p>
            </div>

            <Link
              href="/"
              className="mt-1 inline-flex items-center px-6 py-3 text-[10px] font-mono uppercase tracking-[0.2em] text-white hover:opacity-80 transition-opacity"
              style={{ backgroundColor: '#C1694F' }}
            >
              Start Exploring
            </Link>
          </motion.div>
        ) : (
          /* ── History list ─────────────────────────────────────────── */
          <div className="flex flex-col">
            {searchHistory.map((query, index) => (
              <Link
                key={`${query}-${index}`}
                href={`/results?q=${encodeURIComponent(query)}`}
                className="group py-6 border-b border-black/10 flex justify-between items-center -mx-6 px-6 hover:bg-black/[0.02] transition-colors"
              >
                <div className="flex items-center gap-6">
                  {/* Decorative index — intentionally faint chrome */}
                  <span className="font-mono text-[10px] text-black/20">
                    {(index + 1).toString().padStart(2, '0')}
                  </span>
                  <h2 className="text-2xl font-serif text-black group-hover:text-black/70 transition-colors">
                    {query}
                  </h2>
                </div>
                {/* Arrow — intentionally faint chrome, reveals on hover */}
                <svg
                  className="w-4 h-4 text-black/20 group-hover:text-black transition-colors"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.5"
                    d="M17 8l4 4m0 0l-4 4m4-4H3"
                  />
                </svg>
              </Link>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
