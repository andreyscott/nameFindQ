"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, useRef, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { VibeScanner } from "../components/VibeScanner";
import { usePersistence } from "../hooks/usePersistence";

// ── Bookmark icon (outline / filled) ─────────────────────────────────────
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

// ── Branch / Tree icon ────────────────────────────────────────────────────
function TreeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="16" y="16" width="6" height="6" rx="1" />
      <rect x="2" y="16" width="6" height="6" rx="1" />
      <rect x="9" y="2" width="6" height="6" rx="1" />
      <path d="M5 16v-3a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3" />
      <path d="M12 8v3" />
    </svg>
  );
}

// ── Results content (uses useSearchParams — must be inside Suspense) ──────
function ResultsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = searchParams.get("q") || "";
  const type = searchParams.get("type") || "vibe";

  const { addHistory, toggleSave, isSaved } = usePersistence();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Track which name is currently being saved (for loading state on the button)
  const [savingName, setSavingName] = useState<string | null>(null);

  // ── History guard — fires addHistory exactly once per query ─────────
  // Using a cancellation flag (standard React pattern) rather than a ref so
  // it also handles React StrictMode's double-invoke safely.
  useEffect(() => {
    if (!query) {
      router.push("/");
      return;
    }

    let cancelled = false;

    const fetchResults = async () => {
      try {
        const res = await fetch("/api/namefind", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, type }),
        });
        const json = await res.json();

        if (!res.ok) throw new Error(json.error || "Failed to fetch");

        if (!cancelled) {
          setData(json);
          // ✅ SAFE HISTORY LOG — only runs if this effect wasn't cleaned up.
          // In StrictMode the cleanup fires before the second run, so the first
          // call's addHistory is skipped (cancelled=true) and only the second
          // invocation writes the log — exactly one entry per search.
          addHistory(query);
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchResults();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, type]);

  // ── Save handler ──────────────────────────────────────────────────────
  const handleSave = async (
    e: React.MouseEvent,
    item: { name: string; short_meaning?: string; primary_meaning?: string }
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (savingName) return;

    setSavingName(item.name);
    try {
      await toggleSave({
        name: item.name,
        short_meaning: item.short_meaning || item.primary_meaning || "",
      });
    } finally {
      setSavingName(null);
    }
  };

  // ── View Tree handler ─────────────────────────────────────────────────
  const handleViewTree = (e: React.MouseEvent, name: string) => {
    e.preventDefault();
    e.stopPropagation();
    router.push(`/tree?name=${encodeURIComponent(name)}`);
  };

  // ── Loading ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh]">
        <VibeScanner isTyping={true} />
        <p className="mt-8 font-mono text-[10px] tracking-[0.3em] uppercase text-black/50">
          Synthesizing Onomastic Data...
        </p>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh]">
        <p className="font-mono text-xs text-red-500 tracking-widest uppercase">
          ⚠ {error}
        </p>
        <button
          onClick={() => router.push("/")}
          className="mt-8 text-xs underline uppercase tracking-widest font-mono"
        >
          Return to search
        </button>
      </div>
    );
  }

  if (!data || !data.results) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="w-full max-w-2xl mx-auto pt-32 pb-32 px-6"
    >
      {/* Query heading */}
      <div className="text-center mb-16">
        <h1 className="text-5xl md:text-7xl font-serif text-black mb-10 capitalize">
          {query}
        </h1>
        <div className="flex flex-wrap justify-center gap-3">
          {data.query_tags?.map((tag: string) => (
            <span
              key={tag}
              className="px-4 py-2 text-[10px] md:text-xs font-mono uppercase tracking-widest border border-black text-black"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Result rows */}
      <div className="flex flex-col">
        {data.results.map((item: any, index: number) => {
          const saved = isSaved(item.name);
          const isSavingThis = savingName === item.name;

          return (
            <motion.div
              key={item.name}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group border-b border-black/10 -mx-6"
            >
              {/* Row layout: link text (left) + action buttons (right) */}
              <div className="flex items-start justify-between gap-4 py-8 px-6 hover:bg-black/[0.02] transition-colors">
                {/* ── Name + meaning (navigates to detail page) ──────── */}
                <Link
                  href={`/name/${encodeURIComponent(item.name)}`}
                  className="flex-1 min-w-0"
                >
                  <h2 className="text-3xl font-serif text-black mb-2 group-hover:text-black/70 transition-colors">
                    {item.name}
                  </h2>
                  <p className="text-sm text-black/80 font-sans">
                    {item.short_meaning || item.primary_meaning}
                  </p>
                </Link>

                {/* ── Action buttons ──────────────────────────────────── */}
                <div className="flex items-center gap-1 pt-1 shrink-0">
                  {/* Save / bookmark button */}
                  <button
                    id={`save-${item.name.toLowerCase().replace(/\s+/g, "-")}`}
                    onClick={(e) => handleSave(e, item)}
                    disabled={isSavingThis}
                    aria-label={saved ? `Unsave ${item.name}` : `Save ${item.name}`}
                    title={saved ? "Remove from saved" : "Save to collection"}
                    className={`w-9 h-9 flex items-center justify-center border transition-all duration-200
                      ${saved
                        ? "border-black bg-black text-white"
                        : "border-black/20 text-black/30 hover:border-black hover:text-black"
                      }
                      ${isSavingThis ? "opacity-40 cursor-wait" : ""}
                    `}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={saved ? "filled" : "outline"}
                        initial={{ scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.6, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                      >
                        <BookmarkIcon filled={saved} />
                      </motion.span>
                    </AnimatePresence>
                  </button>

                  {/* View Tree button */}
                  <button
                    id={`tree-${item.name.toLowerCase().replace(/\s+/g, "-")}`}
                    onClick={(e) => handleViewTree(e, item.name)}
                    aria-label={`View etymology tree for ${item.name}`}
                    title="View origin tree"
                    className="w-9 h-9 flex items-center justify-center border border-black/20 text-black/30 hover:border-black hover:text-black transition-all duration-200"
                  >
                    <TreeIcon />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Load more */}
      <div className="mt-16 flex justify-center">
        <button className="text-[10px] font-mono tracking-[0.2em] uppercase border-b border-black pb-1 hover:opacity-50 transition-opacity">
          Load More
        </button>
      </div>
    </motion.div>
  );
}

// ── Default export ────────────────────────────────────────────────────────
export default function ResultsPage() {
  return (
    <div className="min-h-screen pt-20">
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center">
            <VibeScanner isTyping={true} />
          </div>
        }
      >
        <ResultsContent />
      </Suspense>
    </div>
  );
}
