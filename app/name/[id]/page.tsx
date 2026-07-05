"use client";

import { useEffect, useState, useMemo, use } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { VibeScanner } from "../../components/VibeScanner";
import { EtymologyTree } from "../../components/EtymologyTree";
import { usePersistence } from "../../hooks/usePersistence";
import { createClient } from "../../../utils/supabase/client";

// ── Bookmark icon ──────────────────────────────────────────────────────────
function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

// ── Back arrow icon ────────────────────────────────────────────────────────
function ArrowLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 5l-7 7 7 7" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function NameDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const nameId = decodeURIComponent(id);
  const displayTitle = nameId.charAt(0).toUpperCase() + nameId.slice(1);

  const router = useRouter();
  const { toggleSave, isSaved } = usePersistence();
  const supabase = useMemo(() => createClient(), []);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const saved = isSaved(displayTitle);

  // ── Fetch name data from Supabase ────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function fetchNameData() {
      try {
        const { data: nameData, error: fetchError } = await supabase
          .from("names")
          .select("*")
          .ilike("name", nameId)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (fetchError) throw fetchError;
        if (!cancelled) setData(nameData);
      } catch (err: any) {
        if (!cancelled) setError("Could not find data for this name.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchNameData();
    return () => { cancelled = true; };
  }, [nameId, supabase]);

  // ── Save handler ─────────────────────────────────────────────────────
  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await toggleSave({
        name: displayTitle,
        short_meaning: data?.primary_meaning || "",
      });
    } finally {
      setSaving(false);
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6">
        <VibeScanner isTyping={true} />
        <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-black/40">
          Retrieving Onomastic Data…
        </p>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-6 text-center">
        <p className="font-mono text-xs text-black/40 tracking-widest uppercase">
          ⚠ {error || "Name not found"}
        </p>
        <Link
          href="/"
          className="text-[10px] font-mono uppercase tracking-widest border-b border-black pb-0.5 hover:opacity-50 transition-opacity"
        >
          Return to Discovery
        </Link>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-3xl mx-auto px-6 pt-28 pb-40"
    >

      {/* ── Sticky sub-header ──────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-16">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.2em] text-black/30 hover:text-black transition-colors"
        >
          <ArrowLeftIcon />
          Back
        </button>

        {/* Save button — terracotta when active */}
        <button
          id="save-name-btn"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 border text-[10px] font-mono uppercase tracking-[0.2em] transition-all duration-200"
          style={
            saved
              ? { backgroundColor: "#C1694F", borderColor: "#C1694F", color: "#fff" }
              : { backgroundColor: "transparent", borderColor: "#111", color: "#111" }
          }
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={saved ? "saved" : "unsaved"}
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.7, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <BookmarkIcon filled={saved} />
            </motion.span>
          </AnimatePresence>
          {saving ? "Saving…" : saved ? "Saved" : "Save to Collection"}
        </button>
      </div>

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <div className="text-center mb-16">
        <h1 className="text-7xl md:text-9xl font-serif text-black mb-4 leading-none">
          {displayTitle}
        </h1>

        {data.pronunciation && (
          <p className="font-mono text-sm text-black/40 tracking-widest mb-8">
            {data.pronunciation}
          </p>
        )}

        {/* Metadata pills */}
        <div className="flex flex-wrap justify-center gap-2 mb-4">
          {data.region_origin && (
            <span className="px-3 py-1 text-[9px] font-mono uppercase tracking-widest border border-black text-black">
              {data.region_origin}
            </span>
          )}
          {data.ethnicity_tribe && (
            <span className="px-3 py-1 text-[9px] font-mono uppercase tracking-widest border border-black text-black">
              {data.ethnicity_tribe}
            </span>
          )}
          {data.gender && (
            <span className="px-3 py-1 text-[9px] font-mono uppercase tracking-widest border border-black/20 text-black/50">
              {data.gender}
            </span>
          )}
        </div>
      </div>

      {/* ── Meanings ───────────────────────────────────────────────── */}
      <div className="space-y-10 border-t border-black/10 pt-12 mb-16">

        <section>
          <p className="font-mono text-[9px] tracking-[0.3em] uppercase text-black/30 mb-3">
            Primary Meaning
          </p>
          <h2 className="font-serif text-3xl text-black leading-snug">
            {data.primary_meaning || "Literal translation not available."}
          </h2>
        </section>

        {data.contextual_meaning && (
          <section>
            <p className="font-mono text-[9px] tracking-[0.3em] uppercase text-black/30 mb-3">
              Contextual Meaning
            </p>
            <p className="font-sans text-black/70 leading-relaxed text-base italic border-l-2 border-black/10 pl-5">
              {data.contextual_meaning}
            </p>
          </section>
        )}

        {data.linguistic_root && (
          <section>
            <p className="font-mono text-[9px] tracking-[0.3em] uppercase text-black/30 mb-3">
              Linguistic Root
            </p>
            <p className="font-mono text-sm text-black/70 bg-black/[0.03] border border-black/10 px-5 py-4 leading-relaxed">
              {data.linguistic_root}
            </p>
          </section>
        )}

        {data.vibe_tags && data.vibe_tags.length > 0 && (
          <section>
            <p className="font-mono text-[9px] tracking-[0.3em] uppercase text-black/30 mb-3">
              Aesthetic Resonance
            </p>
            <div className="flex flex-wrap gap-2">
              {data.vibe_tags.map((tag: string) => (
                <span
                  key={tag}
                  className="px-3 py-1 text-[9px] font-mono uppercase tracking-widest bg-black text-white"
                >
                  {tag}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ── Etymology Tree — full-width, centre-stage ──────────────── */}
      <div className="border-t border-black/10 pt-12">
        <div className="flex items-center gap-4 mb-10">
          <div className="flex-1 h-px bg-black/10" />
          <p className="font-mono text-[9px] tracking-[0.35em] uppercase text-black/30 whitespace-nowrap">
            Lineage Tree
          </p>
          <div className="flex-1 h-px bg-black/10" />
        </div>

        <EtymologyTree name={displayTitle} />
      </div>

      {/* ── Bottom CTA row ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 mt-16 border-t border-black/10 pt-12">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 py-4 text-[10px] font-mono uppercase tracking-[0.2em] transition-all duration-200 border"
          style={
            saved
              ? { backgroundColor: "#C1694F", borderColor: "#C1694F", color: "#fff" }
              : { backgroundColor: "#111", borderColor: "#111", color: "#fff" }
          }
        >
          <BookmarkIcon filled={saved} />
          {saving ? "Saving…" : saved ? "Saved to Collection" : "Save to Collection"}
        </button>

        <Link
          href={`/tree?name=${encodeURIComponent(displayTitle)}`}
          className="flex-1 flex items-center justify-center gap-2 py-4 text-[10px] font-mono uppercase tracking-[0.2em] border border-black text-black hover:bg-black/5 transition-colors"
        >
          View Full Lineage
        </Link>
      </div>

    </motion.div>
  );
}
