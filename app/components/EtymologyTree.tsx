"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { TreeData, TreeBranch } from "../api/tree/route";

// ── Static demo shown when no name is passed ──────────────────────────────
const DEMO: TreeData = {
  name: "Lucius",
  root_label: "*leuk-",
  root_meaning: "Light",
  primary_epoch: "Proto-Indo-European",
  primary_context:
    "The root *leuk- gave rise to concepts of illumination across the ancient world, from Latin lux to Sanskrit ruc.",
  region: "Roman Empire (Italy)",
  tribe: "Latin",
  branches: [
    { name: "Lucius",   meaning: "Bringer of light",      variant_type: "Direct",    sub_variant: "Luciano",   sub_variant_region: "Romance"  },
    { name: "Lucian",   meaning: "Of light, luminous",     variant_type: "Extended",  sub_variant: "Lutz",      sub_variant_region: "Germanic" },
    { name: "Lucia",    meaning: "Graceful light bearer",  variant_type: "Feminine",  sub_variant: "Lucie",     sub_variant_region: "Modern"   },
  ],
  narrative:
    "From the ancient Proto-Indo-European dawn to the modern European twilight, Lucius remains a testament to the human desire to be associated with clarity, vision, and the celestial.",
  source: "db",
};

// ── Variant type label styles ─────────────────────────────────────────────
const VARIANT_STYLE: Record<string, string> = {
  Direct:      "border border-black bg-black text-white",
  Extended:    "border-y border-black bg-white text-black/70",
  Feminine:    "border border-black bg-white text-black/70",
  "Short Form": "border border-black bg-white text-black/60",
  Modern:      "border border-black bg-white text-black/50",
};

// ── Sub-label colour ──────────────────────────────────────────────────────
interface Props {
  name?: string;
}

export function EtymologyTree({ name }: Props) {
  const [tree, setTree] = useState<TreeData | null>(name ? null : DEMO);
  const [loading, setLoading] = useState(!!name);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'db' | 'ai' | null>(null);

  useEffect(() => {
    if (!name) {
      setTree(DEMO);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setTree(null);

    (async () => {
      try {
        const res = await fetch("/api/tree", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load etymology.");
        if (!cancelled) {
          setTree(json as TreeData);
          setSource(json.source ?? "ai");
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message ?? "Could not load etymology tree.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [name]);

  // ── Loading state ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="w-full flex flex-col items-center py-20 gap-6">
        <motion.div
          className="w-px bg-black/20"
          animate={{ height: [20, 80, 20] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        />
        <p className="font-mono text-[9px] tracking-[0.3em] uppercase text-black/40">
          {name ? `Tracing lineage of ${name}…` : "Loading…"}
        </p>
        <motion.div
          className="border border-black/10 px-8 py-4"
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        >
          <span className="font-serif text-2xl text-black/30 italic">—</span>
        </motion.div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────
  if (error || !tree) {
    return (
      <div className="w-full flex flex-col items-center py-20 text-center">
        <p className="font-mono text-[10px] tracking-widest uppercase text-red-500">
          ⚠ {error ?? "Etymology data unavailable."}
        </p>
        {name && (
          <p className="mt-3 font-mono text-[9px] text-black/30 uppercase tracking-widest">
            Try searching for {name} from the Discovery tab to generate its data.
          </p>
        )}
      </div>
    );
  }

  const [b0, b1, b2] = tree.branches;

  return (
    <div className="w-full flex flex-col items-center py-12 relative z-10 font-sans">

      {/* Source badge */}
      <AnimatePresence>
        {source === "ai" && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 flex items-center gap-2"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-black/30 inline-block animate-pulse" />
            <span className="font-mono text-[8px] tracking-[0.25em] uppercase text-black/30">
              AI Enriched
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="text-[9px] font-mono tracking-[0.2em] uppercase text-black/50 mb-6">
        Onomastic Origin
      </div>

      {/* ── Root Node ──────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center">
        <div className="text-[8px] uppercase tracking-widest text-black/40 mb-2">Root</div>
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="border border-black px-6 py-3 bg-white"
        >
          <span className="font-serif text-2xl italic">{tree.root_label}</span>
        </motion.div>
        <div className="text-xs text-black/60 mt-2">{tree.root_meaning}</div>
      </div>

      <div className="w-px h-12 bg-black/20 my-2" />

      {/* ── Primary Ancestor ───────────────────────────────────────────── */}
      <div className="flex flex-col items-center">
        <div className="text-[8px] uppercase tracking-widest text-black/40 mb-2">
          {tree.tribe} · {tree.primary_epoch}
        </div>
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="border border-black px-8 py-4 bg-white max-w-xs text-center"
          title={tree.primary_context}
        >
          <span className="font-serif text-2xl">{tree.name}</span>
          <p className="font-mono text-[8px] text-black/40 mt-1 tracking-wider">{tree.region}</p>
        </motion.div>
      </div>

      <div className="w-px h-8 bg-black/20 my-2" />

      {/* ── Horizontal branch ─────────────────────────────────────────── */}
      <div className="w-[280px] md:w-[400px] h-px bg-black/20" />
      <div className="w-[280px] md:w-[400px] flex justify-between">
        <div className="w-px h-6 bg-black/20 ml-12" />
        <div className="w-px h-6 bg-black/20" />
        <div className="w-px h-6 bg-black/20 mr-12" />
      </div>

      {/* ── Three Branch Children ─────────────────────────────────────── */}
      <div className="w-full max-w-[320px] md:max-w-[440px] flex justify-between -mt-[1px]">
        {[b0, b1, b2].map((branch, i) => (
          <motion.div
            key={branch.name}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 + i * 0.1 }}
            className="flex flex-col items-center w-1/3"
          >
            <div className={`w-full py-3 text-center ${VARIANT_STYLE[branch.variant_type] ?? "border border-black bg-white text-black/70"}`}>
              <span className="font-serif text-xl">{branch.name}</span>
            </div>
            <div className="text-[8px] uppercase tracking-widest text-black/40 mt-2">
              {branch.variant_type}
            </div>
            <div className="w-px h-8 bg-black/20 mt-4" />
            <div className="border border-black border-dashed px-4 py-2 mt-4 text-center">
              <span className="font-serif text-sm">{branch.sub_variant}</span>
            </div>
            <div className="text-[7px] uppercase tracking-widest text-black/40 mt-1">
              {branch.sub_variant_region}
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── Narrative ─────────────────────────────────────────────────── */}
      <div className="w-full max-w-sm mt-16 pt-8 border-t border-black/10 text-center">
        <p className="text-sm leading-relaxed text-black/80 font-sans">
          {tree.narrative}
        </p>
      </div>

      {/* ── Action Buttons ────────────────────────────────────────────── */}
      <div className="flex gap-4 mt-12 w-full max-w-xs">
        <button className="flex-1 bg-black text-white text-[9px] uppercase tracking-[0.1em] py-4 hover:bg-black/80 transition-colors">
          Save to Tree
        </button>
        <button className="flex-1 bg-transparent border border-black text-black text-[9px] uppercase tracking-[0.1em] py-4 hover:bg-black/5 transition-colors">
          Compare Names
        </button>
      </div>
    </div>
  );
}
