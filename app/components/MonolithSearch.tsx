'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VibeScanner } from './VibeScanner';
import { SearchBar } from './SearchBar';
import { SearchResults } from './SearchResults';
import { useRouter } from 'next/navigation';
import type { NameSearchResult } from '../api/search/route';

type SearchMode = 'vibe' | 'blend' | 'semantic';

// ── Tab definitions + micro-copy ─────────────────────────────────────────
const TABS: { id: SearchMode; label: string; hint: string }[] = [
  { id: 'vibe',     label: 'vibe',     hint: 'Describe a feeling or origin'  },
  { id: 'blend',    label: 'blend',    hint: 'Combine two name roots'         },
  { id: 'semantic', label: 'semantic', hint: 'Search by meaning or culture'   },
];

// ── Suggestion pills per mode ─────────────────────────────────────────────
const PILLS: Record<SearchMode, string[]> = {
  vibe: [
    'Born on a Friday',
    'Warrior',
    'Gift of God',
    'Peaceful river',
    'Igbo names meaning wealth',
    'Strong like oak',
    'Daughter of the king',
  ],
  blend: [
    'Yoruba + Celtic',
    'Edo + Gaelic',
    'Igbo + Norse',
    'African + Scandinavian',
  ],
  semantic: [],
};

// ── Terracotta accent — used only for active UI states ────────────────────
const ACCENT = '#C1694F';

export function MonolithSearch() {
  const [isFocused, setIsFocused] = useState(false);
  const [value, setValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [searchMode, setSearchMode] = useState<SearchMode>('vibe');
  const router = useRouter();

  // Semantic RAG state
  const [semanticResults, setSemanticResults] = useState<NameSearchResult[]>([]);
  const [semanticQuery, setSemanticQuery] = useState('');
  const [semanticLoading, setSemanticLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    setIsTyping(true);
    setTimeout(() => setIsTyping(false), 1000);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && value.trim()) {
      router.push(`/results?q=${encodeURIComponent(value.trim())}&type=${searchMode}`);
    }
  };

  const handleModeSwitch = (mode: SearchMode) => {
    setSearchMode(mode);
    setValue('');
    // Clear semantic results when leaving semantic tab
    if (mode !== 'semantic') {
      setSemanticResults([]);
      setSemanticQuery('');
    }
  };

  // Clicking a suggestion pill instantly triggers the search
  const handlePill = (pill: string) => {
    setValue(pill);
    router.push(`/results?q=${encodeURIComponent(pill)}&type=${searchMode}`);
  };

  return (
    <div className="relative w-full max-w-3xl mx-auto flex flex-col items-center justify-center z-10">

      {/* ── Tab Toggle with micro-copy ─────────────────────────────── */}
      <div className="flex gap-8 mb-8">
        {TABS.map(({ id, label, hint }) => (
          <button
            key={id}
            id={`tab-${id}`}
            onClick={() => handleModeSwitch(id)}
            className="flex flex-col items-center gap-1"
            aria-pressed={searchMode === id}
          >
            {/* Tab label */}
            <span
              className={`font-mono text-[10px] tracking-[0.3em] uppercase transition-all pb-1 border-b ${
                searchMode === id
                  ? 'border-[#C1694F] text-[#C1694F]'
                  : 'text-black/20 border-transparent hover:text-black/40'
              }`}
            >
              {label}
            </span>
            {/* Micro-copy — visible only on active tab */}
            <span
              className={`font-mono text-[8px] tracking-[0.1em] lowercase transition-all duration-300 whitespace-nowrap ${
                searchMode === id
                  ? 'opacity-100 text-black/30 max-h-4'
                  : 'opacity-0 max-h-0'
              }`}
              aria-hidden="true"
            >
              {hint}
            </span>
          </button>
        ))}
      </div>

      {/* ── Panel: Vibe / Blend ────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {(searchMode === 'vibe' || searchMode === 'blend') && (
          <motion.div
            key="llm-search"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3 }}
            className="w-full"
          >
            <div className="relative w-full mb-6">
              <input
                id="llm-search-input"
                type="text"
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder={searchMode === 'vibe' ? 'Enter origin...' : 'Root + Root...'}
                className="w-full bg-transparent text-center text-5xl md:text-7xl font-serif text-black placeholder-black/20 outline-none border-none py-4 transition-all"
                spellCheck={false}
                autoComplete="off"
              />
              {/* Cyan focus underline — kept (serves input-focus purpose, not selection) */}
              <motion.div
                className="absolute bottom-0 left-1/2 h-[1px] bg-[#38BDF8] shadow-[0_0_10px_rgba(56,189,248,0.8)]"
                initial={{ width: 0, x: '-50%' }}
                animate={{
                  width: isFocused ? '100%' : '0%',
                  opacity: isFocused ? 1 : 0,
                }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>

            {/* ── Suggestion pills — zero state only ───────────────── */}
            <AnimatePresence>
              {!value && PILLS[searchMode].length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.25 }}
                  className="w-full flex flex-wrap justify-center gap-2 mb-6"
                  aria-label="Example searches"
                >
                  {PILLS[searchMode].map((pill) => (
                    <button
                      key={pill}
                      onClick={() => handlePill(pill)}
                      className="border border-black/10 text-[9px] font-mono tracking-[0.15em] uppercase px-3 py-1.5 text-black/50 hover:border-black/40 hover:text-black hover:bg-black/[0.02] transition-all"
                    >
                      {pill}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <VibeScanner isTyping={isTyping} />
          </motion.div>
        )}

        {/* ── Panel: Semantic RAG search ───────────────────────────── */}
        {searchMode === 'semantic' && (
          <motion.div
            key="semantic-search"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3 }}
            className="w-full"
          >
            {/* Descriptor */}
            <p className="text-center font-mono text-[9px] tracking-[0.35em] text-black/30 uppercase mb-6">
              Vector similarity · Real database names
            </p>

            <SearchBar
              onResults={(results, q) => {
                setSemanticResults(results);
                setSemanticQuery(q);
              }}
              onLoading={setSemanticLoading}
            />

            <SearchResults
              results={semanticResults}
              query={semanticQuery}
              isLoading={semanticLoading}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
