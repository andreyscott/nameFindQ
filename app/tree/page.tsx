"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { EtymologyTree } from "../components/EtymologyTree";
import { VibeScanner } from "../components/VibeScanner";

// ── Inner page — uses useSearchParams (must be inside Suspense) ───────────
function TreeContent() {
  const searchParams = useSearchParams();
  const name = searchParams.get("name") ?? undefined;

  return (
    <div className="min-h-screen pt-32 pb-32 px-6 overflow-hidden">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full max-w-4xl mx-auto"
      >
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-5xl md:text-7xl font-serif text-black mb-4">
            {name ? (
              <>
                Lineage
                <span className="text-black/20 mx-4">·</span>
                <span className="capitalize">{name}</span>
              </>
            ) : (
              "Lineage"
            )}
          </h1>
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-black/50">
            {name
              ? `Global etymological mapping — ${name}`
              : "Global Etymological Mapping"}
          </p>
        </div>

        {/* Tree */}
        <div className="flex flex-col items-center">
          <EtymologyTree name={name} />

          {/* Static analysis panel — shown only on the generic /tree page */}
          {!name && (
            <div className="mt-20 p-8 border border-black/10 max-w-lg text-center">
              <h4 className="font-serif text-xl mb-4">Structural Analysis</h4>
              <p className="text-xs text-black/60 leading-relaxed font-sans">
                The tree above illustrates the phonetic and semantic migration of
                core Indo-European roots. Each node represents a distinct
                linguistic epoch where meanings evolved through vowel shifting
                and regional adaptation.
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ── Default export — wraps in Suspense for useSearchParams ───────────────
export default function TreePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col items-center justify-center gap-6">
          <VibeScanner isTyping={true} />
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-black/40">
            Initialising…
          </p>
        </div>
      }
    >
      <TreeContent />
    </Suspense>
  );
}
