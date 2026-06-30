"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { VibeScanner } from "../components/VibeScanner";

import { usePersistence } from "../hooks/usePersistence";

function ResultsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const query = searchParams.get("q") || "";
  const type = searchParams.get("type") || "vibe";
  const { addHistory } = usePersistence();
  
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query) {
      router.push("/");
      return;
    }

    const fetchResults = async () => {
      try {
        const res = await fetch("/api/namefind", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, type }),
        });
        const json = await res.json();
        
        if (!res.ok) throw new Error(json.error || "Failed to fetch");
        
        setData(json);
        addHistory(query); // Record search in history
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [query, router, addHistory]);

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

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh]">
        <p className="font-mono text-xs text-red-500 tracking-widest uppercase">⚠ {error}</p>
        <button onClick={() => router.push("/")} className="mt-8 text-xs underline uppercase tracking-widest font-mono">
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

      <div className="flex flex-col">
        {data.results.map((item: any, index: number) => (
          <Link href={`/name/${encodeURIComponent(item.name)}`} key={item.name}>
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group py-8 border-b border-black/10 cursor-pointer hover:bg-black/[0.02] transition-colors -mx-6 px-6"
            >
              <h2 className="text-3xl font-serif text-black mb-2 group-hover:text-black/70 transition-colors">
                {item.name}
              </h2>
              <p className="text-sm text-black/80 font-sans">
                {item.short_meaning}
              </p>
            </motion.div>
          </Link>
        ))}
      </div>

      <div className="mt-16 flex justify-center">
        <button className="text-[10px] font-mono tracking-[0.2em] uppercase border-b border-black pb-1 hover:opacity-50 transition-opacity">
          Load More
        </button>
      </div>
    </motion.div>
  );
}

export default function ResultsPage() {
  return (
    <div className="min-h-screen pt-20">
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><VibeScanner isTyping={true} /></div>}>
        <ResultsContent />
      </Suspense>
    </div>
  );
}
