'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { NameSearchResult } from '../api/search/route';

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------
interface SearchBarProps {
  onResults: (results: NameSearchResult[], query: string) => void;
  onLoading: (loading: boolean) => void;
}

// -----------------------------------------------------------------------
// SearchBar Component
// -----------------------------------------------------------------------
export function SearchBar({ onResults, onLoading }: SearchBarProps) {
  const [value, setValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);
    onLoading(true);

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Search failed.');
      }

      onResults(json.results ?? [], json.query ?? query);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Search failed.';
      setError(message);
      onResults([], query);
    } finally {
      setIsLoading(false);
      onLoading(false);
    }
  }, [isLoading, onResults, onLoading]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch(value);
    }
  };

  return (
    <div className="relative w-full">
      {/* Input row */}
      <div className="relative w-full flex items-center gap-3">
        <div className="relative flex-1">
          <input
            id="semantic-search-input"
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="e.g. strong warrior from Yoruba tribe..."
            className="w-full bg-transparent text-center text-5xl md:text-7xl font-serif text-black placeholder-black/20 outline-none border-none py-4 transition-all"
            spellCheck={false}
            autoComplete="off"
            disabled={isLoading}
          />

          {/* Focus / active underline — cyan for idle, animated pulse when loading */}
          <motion.div
            className="absolute bottom-0 left-1/2 h-[1px]"
            style={{
              background: isLoading
                ? 'linear-gradient(90deg, transparent, #38BDF8, transparent)'
                : '#38BDF8',
              boxShadow: '0 0 10px rgba(56,189,248,0.8)',
            }}
            initial={{ width: 0, x: '-50%' }}
            animate={{
              width: isFocused || isLoading ? '100%' : '0%',
              opacity: isFocused || isLoading ? 1 : 0,
            }}
            transition={{
              duration: isLoading ? 1.2 : 0.6,
              ease: isLoading ? 'easeInOut' : 'easeOut',
              repeat: isLoading ? Infinity : 0,
              repeatType: 'reverse',
            }}
          />
        </div>

        {/* Search button */}
        <motion.button
          id="semantic-search-button"
          onClick={() => handleSearch(value)}
          disabled={isLoading || !value.trim()}
          whileTap={{ scale: 0.95 }}
          className="flex-shrink-0 w-10 h-10 flex items-center justify-center border border-black/20 hover:border-black/60 disabled:opacity-30 transition-all"
          aria-label="Search"
        >
          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div
                key="spinner"
                initial={{ opacity: 0, rotate: 0 }}
                animate={{ opacity: 1, rotate: 360 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                className="w-4 h-4 border border-black/40 border-t-transparent rounded-full"
              />
            ) : (
              <motion.svg
                key="arrow"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M1 7H13M13 7L7 1M13 7L7 13"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </motion.svg>
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 text-center font-mono text-[10px] tracking-widest text-red-500 uppercase"
          >
            ⚠ {error}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Status hint */}
      <AnimatePresence>
        {isLoading && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-3 text-center font-mono text-[10px] tracking-[0.3em] text-black/40 uppercase"
          >
            Generating semantic vector...
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
