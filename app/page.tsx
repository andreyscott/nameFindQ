"use client";

import { MonolithSearch } from "./components/MonolithSearch";
import { motion } from "framer-motion";

export default function Home() {
  return (
    <main id="search" className="flex min-h-screen flex-col items-center justify-center px-4 sm:px-6 pt-20 sm:pt-24 pb-8 md:py-32 overflow-hidden relative">
      <motion.div
        className="w-full flex flex-col items-center z-10 relative"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="mb-12 opacity-30 select-none">
          <p className="font-mono text-[10px] tracking-[0.3em] text-center mb-2">SYSTEM.INITIALIZED</p>
          <div className="w-px h-12 bg-black/40 mx-auto" />
        </div>
        
        <MonolithSearch />

      </motion.div>
    </main>
  );
}
