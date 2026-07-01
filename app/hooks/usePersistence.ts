"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";

export interface SavedName {
  name: string;
  short_meaning: string;
  savedAt: number;
}

export function usePersistence() {
  const [savedNames, setSavedNames] = useState<SavedName[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [user, setUser] = useState<any>(null);
  
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadFromSupabase(session.user.id);
      } else {
        loadFromLocal();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadFromSupabase(session.user.id);
      } else {
        loadFromLocal();
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const loadFromLocal = () => {
    try {
      const saved = localStorage.getItem("namefind_saved");
      const history = localStorage.getItem("namefind_history");
      if (saved) setSavedNames(JSON.parse(saved));
      if (history) setSearchHistory(JSON.parse(history));
    } catch (e) {
      // Corrupted localStorage data — reset to clean state
      console.warn('[usePersistence] Failed to parse localStorage, resetting.', e);
      localStorage.removeItem("namefind_saved");
      localStorage.removeItem("namefind_history");
    }
  }

  const loadFromSupabase = async (userId: string) => {
    // Fetch saved names by joining the 'names' table
    const { data: savedData, error: savedError } = await supabase
      .from('saved_names')
      .select('created_at, names ( name, primary_meaning )')
      .eq('user_id', userId);

    if (!savedError && savedData) {
      const mappedSaved = savedData.map((row: any) => ({
        name: row.names.name,
        short_meaning: row.names.primary_meaning || "",
        savedAt: new Date(row.created_at).getTime()
      }));
      setSavedNames(mappedSaved);
    }

    // Fetch history
    const { data: historyData, error: historyError } = await supabase
      .from('search_history')
      .select('search_query, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!historyError && historyData) {
      setSearchHistory(historyData.map(r => r.search_query));
    }
  }

  const toggleSave = async (nameObj: { name: string, short_meaning: string }) => {
    if (!user) {
      window.location.href = '/login?message=Please log in to save names to your collection';
      return;
    }

    const isAlreadySaved = savedNames.some((n) => n.name === nameObj.name);

    // Optimistic update
    setSavedNames((prev) => {
      if (isAlreadySaved) return prev.filter((n) => n.name !== nameObj.name);
      return [...prev, { ...nameObj, savedAt: Date.now() }];
    });

    try {
      // We need the UUID from the names table first
      const { data: nameRecord } = await supabase
        .from('names')
        .select('id')
        .ilike('name', nameObj.name)
        .limit(1)
        .single();

      if (!nameRecord) return;

      if (isAlreadySaved) {
        await supabase
          .from('saved_names')
          .delete()
          .eq('user_id', user.id)
          .eq('name_id', nameRecord.id);
      } else {
        await supabase
          .from('saved_names')
          .insert({ user_id: user.id, name_id: nameRecord.id });
      }
    } catch (e) {
      console.error("Error toggling save:", e);
    }
  };

  const isSaved = (name: string) => savedNames.some((n) => n.name === name);

  const addHistory = async (query: string) => {
    if (!query) return;

    if (!user) {
      setSearchHistory((prev) => {
        const filtered = prev.filter((q) => q.toLowerCase() !== query.toLowerCase());
        const updated = [query, ...filtered].slice(0, 50);
        localStorage.setItem("namefind_history", JSON.stringify(updated));
        return updated;
      });
      return;
    }

    setSearchHistory((prev) => {
      const filtered = prev.filter((q) => q.toLowerCase() !== query.toLowerCase());
      return [query, ...filtered].slice(0, 50);
    });

    await supabase.from('search_history').insert({
      user_id: user.id,
      search_query: query
    });
  };

  const clearHistory = async () => {
    setSearchHistory([]);
    if (!user) {
      localStorage.removeItem("namefind_history");
    } else {
      await supabase.from('search_history').delete().eq('user_id', user.id);
    }
  };

  return {
    savedNames,
    searchHistory,
    toggleSave,
    isSaved,
    addHistory,
    clearHistory,
    user
  };
}
