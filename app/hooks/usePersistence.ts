"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";

export interface SavedName {
  name: string;
  short_meaning: string;
  savedAt: number;
}

export function usePersistence() {
  const [savedNames, setSavedNames] = useState<SavedName[]>([]);
  const [user, setUser] = useState<any>(null);

  // ✅ Memoised Supabase client — stable reference across renders
  const supabase = useMemo(() => createClient(), []);

  // ── Load saved names from localStorage (unauthenticated) ─────────────
  const loadFromLocal = useCallback(() => {
    try {
      const saved = localStorage.getItem("namefind_saved");
      if (saved) setSavedNames(JSON.parse(saved));
    } catch (e) {
      console.warn("[usePersistence] Failed to parse localStorage, resetting.", e);
      localStorage.removeItem("namefind_saved");
    }
  }, []);

  // ── Load saved names from Supabase (authenticated) ────────────────────
  const loadFromSupabase = useCallback(
    async (userId: string) => {
      const { data: savedData, error: savedError } = await supabase
        .from("saved_names")
        .select("created_at, names ( name, primary_meaning )")
        .eq("user_id", userId);

      if (!savedError && savedData) {
        const mapped = savedData.map((row: any) => ({
          name: row.names.name,
          short_meaning: row.names.primary_meaning || "",
          savedAt: new Date(row.created_at).getTime(),
        }));
        setSavedNames(mapped);
      }
    },
    [supabase]
  );

  // ── Auth listener — drives all data loading ───────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadFromSupabase(session.user.id);
      } else {
        loadFromLocal();
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadFromSupabase(session.user.id);
      } else {
        loadFromLocal();
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase, loadFromSupabase, loadFromLocal]);

  // ── toggleSave — optimistic UI + Supabase write ───────────────────────
  const toggleSave = useCallback(
    async (nameObj: { name: string; short_meaning: string }) => {
      if (!user) {
        window.location.href =
          "/login?message=Please log in to save names to your collection";
        return;
      }

      const isAlreadySaved = savedNames.some((n) => n.name === nameObj.name);

      setSavedNames((prev) => {
        if (isAlreadySaved) return prev.filter((n) => n.name !== nameObj.name);
        return [...prev, { ...nameObj, savedAt: Date.now() }];
      });

      try {
        const { data: nameRecord } = await supabase
          .from("names")
          .select("id")
          .ilike("name", nameObj.name)
          .limit(1)
          .single();

        if (!nameRecord) return;

        if (isAlreadySaved) {
          await supabase
            .from("saved_names")
            .delete()
            .eq("user_id", user.id)
            .eq("name_id", nameRecord.id);
        } else {
          await supabase
            .from("saved_names")
            .insert({ user_id: user.id, name_id: nameRecord.id });
        }
      } catch (e) {
        console.error("Error toggling save:", e);
      }
    },
    [user, savedNames, supabase]
  );

  // ── isSaved — stable reference ────────────────────────────────────────
  const isSaved = useCallback(
    (name: string) => savedNames.some((n) => n.name === name),
    [savedNames]
  );

  return { savedNames, toggleSave, isSaved, user };
}
