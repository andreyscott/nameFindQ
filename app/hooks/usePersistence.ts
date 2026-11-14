"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";
import { escapeLike } from "@/lib/text";
import { sameName, toggleInList, type SavedName } from "@/lib/saved";

export type { SavedName };

interface SavedRow {
  created_at: string;
  names: { name: string; primary_meaning: string | null } | null;
}

export function usePersistence() {
  const [savedNames, setSavedNames] = useState<SavedName[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const savedRef = useRef<SavedName[]>([]);
  useEffect(() => {
    savedRef.current = savedNames;
  }, [savedNames]);

  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // ── Load saved names for the signed-in user ───────────────────────────
  const loadFromSupabase = useCallback(
    async (userId: string) => {
      const { data, error } = await supabase
        .from("saved_names")
        .select("created_at, names ( name, primary_meaning )")
        .eq("user_id", userId);

      if (error) {
        console.error("[usePersistence] Failed to load saved names:", error.message);
        return;
      }
      setSavedNames(
        ((data ?? []) as unknown as SavedRow[])
          .filter((row) => row.names)
          .map((row) => ({
            name: row.names!.name,
            short_meaning: row.names!.primary_meaning || "",
            savedAt: new Date(row.created_at).getTime(),
          }))
      );
    },
    [supabase]
  );

  // ── Auth listener — drives all data loading ───────────────────────────
  useEffect(() => {
    const apply = (u: User | null) => {
      setUser(u);
      if (u) loadFromSupabase(u.id);
      else setSavedNames([]);
    };

    supabase.auth.getSession().then(({ data: { session } }) => apply(session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) =>
      apply(session?.user ?? null)
    );
    return () => subscription.unsubscribe();
  }, [supabase, loadFromSupabase]);

  // ── toggleSave — optimistic UI, rolled back if the write fails ────────
  const toggleSave = useCallback(
    async (nameObj: { name: string; short_meaning: string }): Promise<boolean> => {
      if (!user) {
        router.push("/login?message=save_requires_login");
        return false;
      }

      const previous = savedRef.current;
      const wasSaved = previous.some((n) => sameName(n.name, nameObj.name));
      const next = toggleInList(previous, nameObj);
      savedRef.current = next; // keep rapid successive clicks consistent
      setSaveError(null);
      setSavedNames(next);

      const fail = (reason: string) => {
        console.error("[usePersistence] Save failed:", reason);
        savedRef.current = previous;
        setSavedNames(previous);
        setSaveError(
          wasSaved ? `Couldn't remove ${nameObj.name}. Please try again.` : `Couldn't save ${nameObj.name}. Please try again.`
        );
        return false;
      };

      // Curated seed rows win over AI rows with the same spelling.
      const { data: nameRecord, error: lookupError } = await supabase
        .from("names")
        .select("id")
        .ilike("name", escapeLike(nameObj.name.trim()))
        .order("source", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lookupError) return fail(lookupError.message);
      if (!nameRecord) return fail(`"${nameObj.name}" is not in the dictionary yet`);

      const { error } = wasSaved
        ? await supabase.from("saved_names").delete().eq("user_id", user.id).eq("name_id", nameRecord.id)
        : await supabase.from("saved_names").upsert(
            { user_id: user.id, name_id: nameRecord.id },
            { onConflict: "user_id,name_id", ignoreDuplicates: true }
          );

      if (error) return fail(error.message);
      return true;
    },
    [user, supabase, router]
  );

  const isSaved = useCallback(
    (name: string) => savedNames.some((n) => sameName(n.name, name)),
    [savedNames]
  );

  return { savedNames, toggleSave, isSaved, user, saveError };
}
