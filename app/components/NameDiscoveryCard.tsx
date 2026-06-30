/* eslint-disable react/no-unescaped-entities */
"use client";

import { useMemo, useEffect, useState } from "react";
import { motion } from "framer-motion";

export interface NameDiscoveryCardProps {
  name: string;
  origin: string;
  meaning: string;
  energy: string;
}

export function NameDiscoveryCard({ name, origin, meaning, energy }: NameDiscoveryCardProps) {
  const [sysRec, setSysRec] = useState<string>("");

  // Generate a client-only random sys rec after mount to avoid
  // server/client hydration mismatches caused by Math.random()
  useEffect(() => {
    setSysRec(Math.random().toString(36).substr(2, 8).toUpperCase());
  }, []);

  return (
    <motion.div
      // De-pixelation / stagger-fade-in effect when entering viewport
      initial={{ opacity: 0, y: 80, filter: "blur(16px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-10%" }}
      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-4xl mx-auto h-[70vh] min-h-125 flex flex-col justify-between p-10 md:p-16 border-2 border-black bg-white hover:bg-white/30 hover:backdrop-blur-md hover:border-white transition-all duration-700 relative group overflow-hidden mb-32"
    >
      {/* Top Metadata */}
      <div className="z-10 flex justify-between items-start">
        <div className="space-y-1">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-black">
            ORIGIN
          </p>
          <p className="font-mono text-sm font-bold text-black">
            {origin}
          </p>
        </div>
        <div className="space-y-1 text-right">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-black">
            ENERGY
          </p>
          <p className="font-mono text-sm font-bold text-black">
            {energy}
          </p>
        </div>
      </div>

      {/* The Name */}
      <div className="z-10 flex flex-col items-center justify-center flex-1 my-8">
        <h2 className="font-serif text-6xl md:text-8xl lg:text-9xl font-bold text-black tracking-tighter text-center">
          {name}
        </h2>
        <p className="mt-8 font-mono text-sm md:text-base text-black/70 max-w-lg text-center leading-relaxed">
          "{meaning}"
        </p>
      </div>

      {/* Mapbox SVG Placeholder (Migration Path) */}
      <div className="absolute bottom-0 left-0 w-full h-[45%] pointer-events-none opacity-10 group-hover:opacity-40 transition-opacity duration-1000 z-0">
        <svg viewBox="0 0 100 50" className="w-full h-full stroke-black fill-none" preserveAspectRatio="none" strokeWidth="0.3">
          {/* Subtle lat/long grid lines to sell the map feel */}
          <line x1="25" y1="0" x2="25" y2="50" strokeDasharray="1 2" />
          <line x1="50" y1="0" x2="50" y2="50" strokeDasharray="1 2" />
          <line x1="75" y1="0" x2="75" y2="50" strokeDasharray="1 2" />

          {/* Abstract Mapbox-style migration path */}
          <motion.path
            d="M0,45 Q25,25 50,35 T80,15 T100,20"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 2.5, ease: "easeInOut", delay: 0.6 }}
          />
          {/* Waypoints */}
          <circle cx="50" cy="35" r="1" className="fill-black" />
          <circle cx="80" cy="15" r="1.5" className="fill-black stroke-white stroke-[0.2]" />
        </svg>
      </div>

      {/* Bottom Metadata */}
      <div className="z-10 flex justify-between items-end border-t border-black/10 pt-6">
        <p className="font-mono text-[10px] text-black/50">
          SYS.REC // {sysRec}
        </p>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
          <p className="font-mono text-[10px] text-black/50 tracking-widest">
            MAPBOX_VIS_ACTIVE
          </p>
        </div>
      </div>
    </motion.div>
  );
}
