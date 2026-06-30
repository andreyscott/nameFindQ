'use client';

import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import type { NameSearchResult } from '../api/search/route';

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------
interface SearchResultsProps {
  results: NameSearchResult[];
  query: string;
  isLoading: boolean;
}

// -----------------------------------------------------------------------
// Vibe tag pill colours — a small curated palette that works on white
// -----------------------------------------------------------------------
const TAG_COLORS: Record<string, string> = {
  default: 'border-black/20 text-black/60',
  strong:  'border-amber-400/60 text-amber-700 bg-amber-50/60',
  ethereal:'border-sky-300/60 text-sky-700 bg-sky-50/60',
  warrior: 'border-red-300/60 text-red-700 bg-red-50/60',
  nature:  'border-emerald-300/60 text-emerald-700 bg-emerald-50/60',
  divine:  'border-violet-300/60 text-violet-700 bg-violet-50/60',
  royal:   'border-yellow-400/60 text-yellow-700 bg-yellow-50/60',
};

function getTagColor(tag: string): string {
  const key = Object.keys(TAG_COLORS).find(
    (k) => k !== 'default' && tag.toLowerCase().includes(k)
  );
  return key ? TAG_COLORS[key] : TAG_COLORS.default;
}

// -----------------------------------------------------------------------
// SearchResults Component
// -----------------------------------------------------------------------
export function SearchResults({ results, query, isLoading }: SearchResultsProps) {

  // Nothing to show yet
  if (!isLoading && results.length === 0 && !query) return null;

  // Loading skeleton
  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full mt-12 flex flex-col gap-0"
      >
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="py-8 border-b border-black/10 flex flex-col gap-3 animate-pulse"
          >
            <div className="h-8 bg-black/5 rounded w-48 mx-auto" />
            <div className="h-4 bg-black/5 rounded w-64 mx-auto" />
            <div className="flex gap-2 justify-center">
              <div className="h-5 bg-black/5 rounded w-16" />
              <div className="h-5 bg-black/5 rounded w-20" />
            </div>
          </div>
        ))}
      </motion.div>
    );
  }

  // Empty results
  if (results.length === 0 && query) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-12 text-center"
      >
        <p className="font-mono text-[10px] tracking-[0.3em] text-black/40 uppercase">
          No semantic matches found
        </p>
        <p className="mt-2 text-sm text-black/30 font-serif">
          Try rephrasing your query — e.g. add a tribe name or describe a feeling.
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      key={query}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full mt-12"
    >
      {/* Result count header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="flex-1 h-px bg-black/10" />
        <p className="font-mono text-[10px] tracking-[0.3em] text-black/30 uppercase whitespace-nowrap">
          {results.length} semantic match{results.length !== 1 ? 'es' : ''}
        </p>
        <div className="flex-1 h-px bg-black/10" />
      </div>

      {/* Result cards */}
      <div className="flex flex-col">
        {results.map((item, index) => (
          <Link
            key={item.id}
            href={`/name/${encodeURIComponent(item.name)}`}
            id={`search-result-${index}`}
          >
            <motion.article
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.07 }}
              className="group py-8 border-b border-black/10 cursor-pointer hover:bg-black/[0.015] transition-colors -mx-6 px-6"
            >
              {/* Tribe / origin badge */}
              {item.ethnicity_tribe && (
                <p className="font-mono text-[9px] tracking-[0.35em] text-black/30 uppercase mb-2">
                  {item.ethnicity_tribe}
                </p>
              )}

              {/* Name */}
              <h2 className="text-3xl font-serif text-black mb-2 group-hover:text-black/60 transition-colors">
                {item.name}
              </h2>

              {/* Primary meaning */}
              {item.primary_meaning && (
                <p className="text-sm text-black/70 font-sans mb-3 leading-relaxed">
                  {item.primary_meaning}
                </p>
              )}

              {/* Contextual meaning — subtle secondary line */}
              {item.contextual_meaning && (
                <p className="text-xs text-black/40 font-sans mb-4 italic leading-relaxed">
                  {item.contextual_meaning}
                </p>
              )}

              {/* Vibe tags */}
              {item.vibe_tags && item.vibe_tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {item.vibe_tags.slice(0, 5).map((tag) => (
                    <span
                      key={tag}
                      className={`px-3 py-1 text-[9px] font-mono uppercase tracking-widest border rounded-sm transition-all ${getTagColor(tag)}`}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </motion.article>
          </Link>
        ))}
      </div>
    </motion.div>
  );
}
