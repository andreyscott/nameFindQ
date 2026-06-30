"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { VibeScanner } from "../../components/VibeScanner";
import { usePersistence } from "../../hooks/usePersistence";
import { createClient } from "../../../utils/supabase/client";

export default function NameDetailsPage({ params }: { params: { id: string } }) {
  const nameId = decodeURIComponent(params.id);
  const { toggleSave, isSaved } = usePersistence();
  const supabase = createClient();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const displayTitle = nameId.charAt(0).toUpperCase() + nameId.slice(1);
  const saved = isSaved(displayTitle);

  useEffect(() => {
    async function fetchNameData() {
      try {
        const { data: nameData, error: fetchError } = await supabase
          .from("names")
          .select("*")
          .ilike("name", nameId)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (fetchError) {
          throw fetchError;
        }

        setData(nameData);
      } catch (err: any) {
        console.error(err);
        setError("Could not find data for this name.");
      } finally {
        setLoading(false);
      }
    }
    fetchNameData();
  }, [nameId]);

  const handleSave = () => {
    toggleSave({
      name: displayTitle,
      short_meaning: data?.primary_meaning || "No meaning provided"
    });
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] pt-32">
        <VibeScanner isTyping={true} />
        <p className="mt-8 font-mono text-[10px] tracking-[0.3em] uppercase text-black/50">
          Retrieving Onomastic Data...
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] pt-32">
        <p className="font-mono text-xs text-red-500 tracking-widest uppercase">⚠ {error || "Name not found"}</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="w-full max-w-2xl mx-auto pt-32 px-6 pb-40 flex flex-col items-center"
    >
      <div className="text-center mb-12">
        <h1 className="text-6xl md:text-8xl font-serif text-black mb-4">{displayTitle}</h1>
        {data.pronunciation && (
          <p className="font-mono text-sm text-black/50 mb-8 tracking-widest">/{data.pronunciation}/</p>
        )}

        <div className="flex flex-wrap justify-center gap-3 mb-10">
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
            <span className="px-3 py-1 text-[9px] font-mono uppercase tracking-widest border border-black/20 text-black/70">
              {data.gender}
            </span>
          )}
        </div>

        <button
          onClick={handleSave}
          className={`px-8 py-3 text-[10px] font-mono uppercase tracking-[0.2em] transition-all border border-black ${saved ? 'bg-black text-white' : 'bg-transparent text-black hover:bg-black/5'
            }`}
        >
          {saved ? 'SAVED' : 'SAVE TO LIST'}
        </button>
      </div>

      <div className="w-full space-y-12 border-t border-black/10 pt-12">
        <section>
          <h3 className="text-3xl font-serif text-black mb-4">Primary Meaning</h3>
          <p className="text-black/80 font-sans leading-relaxed text-sm md:text-base">
            {data.primary_meaning || "Literal translation not available."}
          </p>
        </section>

        {data.contextual_meaning && (
          <section>
            <h3 className="text-3xl font-serif text-black mb-4">Contextual Meaning</h3>
            <p className="text-black/80 font-sans leading-relaxed text-sm md:text-base italic">
              "{data.contextual_meaning}"
            </p>
          </section>
        )}

        <div className="w-full h-px bg-black/10 my-8" />

        <section>
          <h3 className="text-3xl font-serif text-black mb-4">Linguistic Root</h3>
          <p className="text-black/80 font-mono leading-relaxed mb-4 text-sm bg-black/5 p-4 border border-black/10">
            {data.linguistic_root || "No morphological breakdown available."}
          </p>
        </section>

        {data.vibe_tags && data.vibe_tags.length > 0 && (
          <section>
            <h3 className="text-3xl font-serif text-black mb-4">Aesthetic Resonance</h3>
            <div className="flex flex-wrap gap-2">
              {data.vibe_tags.map((tag: string) => (
                <span key={tag} className="px-3 py-1 text-xs font-mono uppercase tracking-widest bg-black text-white">
                  {tag}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Abstract light image at the bottom */}
      <div className="w-full aspect-square md:aspect-video mt-20 relative overflow-hidden bg-black flex items-center justify-center border border-black">
        <div className="w-full h-full bg-gradient-to-r from-black via-white to-black opacity-90 blur-sm mix-blend-screen scale-150 rotate-90" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
      </div>

    </motion.div>
  );
}
