"use client";

import { motion } from "framer-motion";

export function EtymologyTree() {
  return (
    <div className="w-full flex flex-col items-center py-12 relative z-10 font-sans">
      <div className="text-[9px] font-mono tracking-[0.2em] uppercase text-black/50 mb-6">
        Onomastic Origin
      </div>
      
      {/* Root Node */}
      <div className="flex flex-col items-center">
        <div className="text-[8px] uppercase tracking-widest text-black/40 mb-2">Root</div>
        <motion.div 
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="border border-black px-6 py-3 bg-white"
        >
          <span className="font-serif text-2xl italic">*leuk-</span>
        </motion.div>
        <div className="text-xs text-black/60 mt-2">Light</div>
      </div>

      {/* Vertical Line */}
      <div className="w-px h-12 bg-black/20 my-2" />

      {/* Primary Ancestor */}
      <div className="flex flex-col items-center">
        <div className="text-[8px] uppercase tracking-widest text-black/40 mb-2">Latin</div>
        <motion.div 
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}
          className="border border-black px-8 py-4 bg-white"
        >
          <span className="font-serif text-2xl">Lux / Lucere</span>
        </motion.div>
      </div>

      {/* Vertical Line down to branch */}
      <div className="w-px h-8 bg-black/20 my-2" />
      
      {/* Horizontal Branch Line */}
      <div className="w-[280px] md:w-[400px] h-px bg-black/20" />
      
      {/* Three children connection lines */}
      <div className="w-[280px] md:w-[400px] flex justify-between">
        <div className="w-px h-6 bg-black/20 ml-12" />
        <div className="w-px h-6 bg-black/20" />
        <div className="w-px h-6 bg-black/20 mr-12" />
      </div>

      {/* Three children nodes */}
      <div className="w-full max-w-[320px] md:max-w-[440px] flex justify-between -mt-[1px]">
        
        {/* Child 1: Direct */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="flex flex-col items-center w-1/3">
          <div className="w-full border border-black bg-black text-white py-3 text-center">
            <span className="font-serif text-xl">Lucius</span>
          </div>
          <div className="text-[8px] uppercase tracking-widest text-black/40 mt-2">Direct</div>
          <div className="w-px h-8 bg-black/20 mt-4" />
          <div className="border border-black border-dashed px-4 py-2 mt-4 text-center">
            <span className="font-serif text-sm">Luciano</span>
          </div>
          <div className="text-[7px] uppercase tracking-widest text-black/40 mt-1">Romance</div>
        </motion.div>

        {/* Child 2: Extended */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="flex flex-col items-center w-1/3">
          <div className="w-full border-y border-black bg-white text-black py-3 text-center">
            <span className="font-serif text-xl text-black/70">Lucian</span>
          </div>
          <div className="text-[8px] uppercase tracking-widest text-black/40 mt-2">Extended</div>
          <div className="w-px h-8 bg-black/20 mt-4" />
          <div className="border border-black border-dashed px-4 py-2 mt-4 text-center">
            <span className="font-serif text-sm">Lutz</span>
          </div>
          <div className="text-[7px] uppercase tracking-widest text-black/40 mt-1">Germanic</div>
        </motion.div>

        {/* Child 3: Feminine */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="flex flex-col items-center w-1/3">
          <div className="w-full border border-black bg-white text-black py-3 text-center">
            <span className="font-serif text-xl text-black/70">Lucia</span>
          </div>
          <div className="text-[8px] uppercase tracking-widest text-black/40 mt-2">Feminine</div>
          <div className="w-px h-8 bg-black/20 mt-4" />
          <div className="border border-black border-dashed px-4 py-2 mt-4 text-center">
            <span className="font-serif text-sm">Lucie</span>
          </div>
          <div className="text-[7px] uppercase tracking-widest text-black/40 mt-1">Modern</div>
        </motion.div>
      </div>
      
      {/* Context Text */}
      <div className="w-full max-w-sm mt-16 pt-8 border-t border-black/10 text-center">
        <p className="text-sm leading-relaxed text-black/80 font-sans">
          The name <strong className="font-semibold text-black">Lucius</strong> serves as a linguistic vessel for the concept of brilliance. From the ancient Proto-Indo-European dawn to the modern European twilight, it remains a testament to the human desire to be associated with clarity, vision, and the celestial.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4 mt-12 w-full max-w-xs">
        <button className="flex-1 bg-black text-white text-[9px] uppercase tracking-[0.1em] py-4 hover:bg-black/80 transition-colors">
          Save to Tree
        </button>
        <button className="flex-1 bg-transparent border border-black text-black text-[9px] uppercase tracking-[0.1em] py-4 hover:bg-black/5 transition-colors">
          Compare Names
        </button>
      </div>
    </div>
  );
}
