"use client";

import { motion } from "framer-motion";

export function VibeScanner({ isTyping }: { isTyping: boolean }) {
  // A simple array to determine the max height of each bar when active
  const heights = [8, 16, 24, 16, 8];

  return (
    <div className="flex justify-center items-center h-8 opacity-80">
      <div className="flex gap-1.5 items-end h-full">
        {heights.map((h, i) => (
          <motion.div
            key={i}
            className="w-[2px] bg-[#38BDF8]"
            initial={{ height: 4 }}
            animate={{
              height: isTyping ? [4, h, 4] : 4,
            }}
            transition={{
              duration: 0.6,
              repeat: isTyping ? Infinity : 0,
              ease: "easeInOut",
              delay: i * 0.1,
            }}
          />
        ))}
      </div>
    </div>
  );
}
