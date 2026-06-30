import type { Metadata } from "next";
import { Playfair_Display, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "./components/Navbar";
import { BottomNav } from "./components/BottomNav";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Namefind | Monolith",
  description: "Ultra-minimalist futuristic naming tool",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${playfair.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col relative z-0 pb-24">
        <div className="light-leak-cyan opacity-40" />
        <div className="light-leak-blue opacity-40" />
        <Navbar />
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
