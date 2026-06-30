"use client";

import { motion } from "framer-motion";
import { EtymologyTree } from "../components/EtymologyTree";

export default function TreePage() {
  return (
    <div className="min-h-screen pt-32 pb-32 px-6 overflow-hidden">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full max-w-4xl mx-auto"
      >
        <div className="text-center mb-16">
          <h1 className="text-5xl md:text-7xl font-serif text-black mb-4">Lineage</h1>
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-black/50">
            Global Etymological Mapping
          </p>
        </div>

        <div className="flex flex-col items-center">
          <EtymologyTree />
          
          <div className="mt-20 p-8 border border-black/10 max-w-lg text-center">
            <h4 className="font-serif text-xl mb-4">Structural Analysis</h4>
            <p className="text-xs text-black/60 leading-relaxed font-sans">
              The tree above illustrates the phonetic and semantic migration of core Indo-European roots. 
              Each node represents a distinct linguistic epoch where meanings evolved through vowel shifting 
              and regional adaptation.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
