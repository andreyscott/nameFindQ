"use client";

import { useId } from "react";
import { motion } from "framer-motion";

interface DataCardProps {
  root: string;
  energy: string;
  delay: number;
}

export function DataCard({ root, energy, delay }: DataCardProps) {
  const uid = useId().replace(/:/g, '').slice(0, 6).toUpperCase();
  return (
    <motion.div
      initial={{ opacity: 0, y: 50, filter: "blur(12px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.8, ease: "easeOut", delay }}
      className="glass-card rounded-2xl p-8 flex flex-col justify-between w-full h-80 relative overflow-hidden group hover:border-[#38BDF8]/50 transition-colors duration-500"
    >
      {/* Top Section */}
      <div className="z-10">
        <h2 className="font-serif text-5xl mb-3 text-black font-medium">{root}</h2>
        <div className="inline-block px-3 py-1 bg-black/5 rounded-full border border-black/10">
          <p className="font-mono text-xs uppercase tracking-widest text-[#38BDF8] font-bold">
            {energy}
          </p>
        </div>
      </div>

      {/* Background SVG Map Line Art */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.15] group-hover:opacity-30 transition-opacity duration-700">
        <svg viewBox="0 0 100 100" className="w-full h-full stroke-black fill-none" strokeWidth="0.3">
          {/* Subtle grid lines */}
          <line x1="20" y1="0" x2="20" y2="100" strokeDasharray="1 2" opacity="0.5" />
          <line x1="50" y1="0" x2="50" y2="100" strokeDasharray="1 2" opacity="0.5" />
          <line x1="80" y1="0" x2="80" y2="100" strokeDasharray="1 2" opacity="0.5" />
          
          {/* Migration Path */}
          <motion.path
            d="M10,80 Q30,20 50,50 T90,20"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 2.5, delay: delay + 0.4, ease: "easeInOut" }}
          />
          {/* Nodes */}
          <motion.circle 
            cx="10" cy="80" r="1" className="fill-black"
            initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: delay + 0.4 }}
          />
          <motion.circle 
            cx="50" cy="50" r="1" className="fill-black"
            initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: delay + 1.4 }}
          />
          <motion.circle 
            cx="90" cy="20" r="1.5" className="fill-black stroke-[#38BDF8] stroke-[0.5]"
            initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: delay + 2.4 }}
          />
        </svg>
      </div>

      {/* Bottom info to give it terminal vibes */}
      <div className="z-10 flex justify-between items-end">
        <p className="font-mono text-[10px] text-black/40">SYS.ORIGIN.TRK</p>
        <p className="font-mono text-[10px] text-black/40">ID: {uid}</p>
      </div>
    </motion.div>
  );
}
