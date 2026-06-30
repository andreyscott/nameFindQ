'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VibeScanner } from './VibeScanner';
import { SearchBar } from './SearchBar';
import { SearchResults } from './SearchResults';
import { useRouter } from 'next/navigation';
import type { NameSearchResult } from '../api/search/route';

type SearchMode = 'vibe' | 'blend' | 'semantic';

const TABS: { id: SearchMode; label: string }[] = [
  { id: 'vibe',     label: 'vibe'     },
  { id: 'blend',    label: 'blend'    },
  { id: 'semantic', label: 'semantic' },
];

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
    // Clear semantic results when leaving semantic tab
    if (mode !== 'semantic') {
      setSemanticResults([]);
      setSemanticQuery('');
    }
  };

  return (
    <div className="relative w-full max-w-3xl mx-auto flex flex-col items-center justify-center z-10">
      {/* ── Tab Toggle ────────────────────────────────────────── */}
      <div className="flex gap-8 mb-8">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            id={`tab-${id}`}
            onClick={() => handleModeSwitch(id)}
            className={`font-mono text-[10px] tracking-[0.3em] uppercase transition-all pb-1 border-b ${
              searchMode === id
                ? 'text-black border-black'
                : 'text-black/20 border-transparent hover:text-black/40'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Panel: Vibe / Blend (existing LLM route) ─────────── */}
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
              {/* Cyan focus underline */}
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

            <VibeScanner isTyping={isTyping} />
          </motion.div>
        )}

        {/* ── Panel: Semantic RAG search ────────────────────────── */}
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
