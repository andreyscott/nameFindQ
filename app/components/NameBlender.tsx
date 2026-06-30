"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function NameBlender() {
  const [root1, setRoot1] = useState("");
  const [root2, setRoot2] = useState("");
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [result, setResult] = useState<{ name: string, match: string, explanation: string } | null>(null);
  const [resultId, setResultId] = useState("");

  const handleSynthesize = async () => {
    if (!root1 || !root2) return;
    setIsSynthesizing(true);
    setResult(null);
    setResultId("");

    try {
      const res = await fetch('/api/namefind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `Root 1: ${root1}, Root 2: ${root2}`, type: 'blend' })
      });

      if (!res.ok) throw new Error("Synthesis API failed");
      const data = await res.json();

      const generatedId = Math.random().toString(36).substr(2, 6).toUpperCase();
      setResult({
        name: data.name,
        match: `${Math.floor(Math.random() * 15) + 85}%`,
        explanation: data.etymology
      });
      setResultId(generatedId);
    } catch (err) {
      console.error("Blend failed:", err);
    } finally {
      setIsSynthesizing(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col items-center justify-center py-20 relative overflow-hidden">

      {/* Background ambient glow if active */}
      <AnimatePresence>
        {isSynthesizing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.15 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,#38BDF8_0%,transparent_50%)]"
            transition={{ duration: 1 }}
          />
        )}
      </AnimatePresence>

      <div className="mb-16 flex flex-col items-center opacity-30 select-none">
        <p className="font-mono text-xs tracking-[0.3em] text-center mb-2">NAME BLENDER.SYS</p>
        <div className="w-px h-8 bg-black/40 mx-auto" />
      </div>

      <div className="flex flex-col md:flex-row items-center justify-center gap-10 md:gap-16 w-full relative z-10 px-6">
        <input
          type="text"
          placeholder="ROOT.01"
          value={root1}
          onChange={(e) => setRoot1(e.target.value)}
          spellCheck={false}
          className="bg-transparent text-4xl md:text-6xl font-serif text-center text-black placeholder-black/10 outline-none border-b border-black/10 focus:border-[#38BDF8] focus:shadow-[0_1px_0_0_#38BDF8] pb-3 transition-all w-full md:w-2/5"
        />

        {/* The Portal / Plus Icon */}
        <div className="relative w-20 h-20 flex items-center justify-center shrink-0">
          <AnimatePresence>
            {isSynthesizing ? (
              <motion.div
                key="portal"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0 }}
                className="absolute w-32 h-32 flex items-center justify-center z-0"
              >
                {/* Outer rotating ring */}
                <motion.div
                  className="absolute w-full h-full rounded-full border-[0.5px] border-[#38BDF8]/60"
                  animate={{ scale: [1, 1.3, 1], rotate: [0, 180] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                />
                {/* Core cyan blur */}
                <motion.div
                  className="absolute w-20 h-20 rounded-full bg-[#38BDF8] blur-xl opacity-70"
                  animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0.8, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                />
                {/* Hot white center */}
                <motion.div
                  className="absolute w-8 h-8 rounded-full bg-white blur-sm"
                  animate={{ scale: [0.8, 1.2, 0.8] }}
                  transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
                />
              </motion.div>
            ) : (
              <motion.div
                key="plus"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-black/50 font-mono text-3xl font-light z-10"
              >
                +
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <input
          type="text"
          placeholder="ROOT.02"
          value={root2}
          onChange={(e) => setRoot2(e.target.value)}
          spellCheck={false}
          className="bg-transparent text-4xl md:text-6xl font-serif text-center text-black placeholder-black/10 outline-none border-b border-black/10 focus:border-[#38BDF8] focus:shadow-[0_1px_0_0_#38BDF8] pb-3 transition-all w-full md:w-2/5"
        />
      </div>

      <button
        onClick={handleSynthesize}
        disabled={isSynthesizing || !root1 || !root2}
        className="mt-16 px-10 py-4 font-mono text-xs tracking-[0.3em] uppercase border border-black/20 text-black hover:bg-black hover:text-white disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-black transition-all duration-500 z-10 bg-white/50 backdrop-blur-sm"
      >
        {isSynthesizing ? "Synthesizing..." : "Synthesize"}
      </button>

      {/* Output Section */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 40, filter: "blur(12px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -20, filter: "blur(8px)" }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            className="mt-20 w-full max-w-2xl glass-card rounded-2xl p-12 flex flex-col items-center relative z-10 hover:border-[#38BDF8]/30 transition-colors duration-700"
          >
            <div className="absolute top-0 w-full h-1 bg-linear-to-r from-transparent via-[#38BDF8]/50 to-transparent opacity-50" />

            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#38BDF8] mb-6 font-semibold flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-[#38BDF8] rounded-full animate-pulse" />
              Match Resonance: {result.match}
            </p>
            <h3 className="font-serif text-7xl md:text-8xl font-bold text-black mb-8 tracking-tighter text-center">
              {result.name}
            </h3>
            <div className="w-full h-px bg-black/5 mb-8" />

            <p className="font-mono text-xs md:text-sm text-black/60 text-center leading-loose max-w-lg">
              {result.explanation}
            </p>

            <p className="font-mono text-[10px] text-black/30 mt-8 absolute bottom-4 right-6">
              ID: {resultId}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
