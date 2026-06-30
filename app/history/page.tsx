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
              className="text-[10px] font-mono uppercase tracking-widest text-black/40 hover:text-red-500 transition-colors"
            >
              Clear All
            </button>
          )}
        </div>

        {searchHistory.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-black/10">
            <p className="text-sm text-black/40 font-sans">Your search history is empty.</p>
            <Link href="/" className="mt-4 inline-block text-[10px] font-mono tracking-widest uppercase border-b border-black pb-1 hover:opacity-50 transition-opacity">
              Start a Session
            </Link>
          </div>
        ) : (
          <div className="flex flex-col">
            {searchHistory.map((query, index) => (
              <Link 
                key={`${query}-${index}`} 
                href={`/results?q=${encodeURIComponent(query)}`}
                className="group py-6 border-b border-black/10 flex justify-between items-center -mx-6 px-6 hover:bg-black/[0.02] transition-colors"
              >
                <div className="flex items-center gap-6">
                  <span className="font-mono text-[10px] text-black/20">
                    {(index + 1).toString().padStart(2, '0')}
                  </span>
                  <h2 className="text-2xl font-serif text-black group-hover:text-black/70 transition-colors">
                    {query}
                  </h2>
                </div>
                <svg className="w-4 h-4 text-black/20 group-hover:text-black transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
