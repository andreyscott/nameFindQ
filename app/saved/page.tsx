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
          <div className="text-center py-20 border border-dashed border-black/10">
            <p className="text-sm text-black/40 font-sans">No names saved yet.</p>
            <Link href="/" className="mt-4 inline-block text-[10px] font-mono tracking-widest uppercase border-b border-black pb-1 hover:opacity-50 transition-opacity">
              Start Discovering
            </Link>
          </div>
        ) : (
          <div className="flex flex-col">
            {savedNames.sort((a, b) => b.savedAt - a.savedAt).map((item, index) => (
              <div key={item.name} className="group py-8 border-b border-black/10 flex justify-between items-center -mx-6 px-6 hover:bg-black/[0.02] transition-colors">
                <Link href={`/name/${encodeURIComponent(item.name)}`} className="flex-1">
                  <h2 className="text-3xl font-serif text-black mb-1 group-hover:text-black/70 transition-colors">
                    {item.name}
                  </h2>
                  <p className="text-xs text-black/60 font-sans">
                    {item.short_meaning}
                  </p>
                </Link>
                <button 
                  onClick={() => toggleSave(item)}
                  className="text-[10px] font-mono uppercase tracking-widest text-red-500 opacity-0 group-hover:opacity-100 transition-opacity hover:underline"
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
