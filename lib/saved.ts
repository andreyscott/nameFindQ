export interface SavedName {
  name: string;
  short_meaning: string;
  savedAt: number;
}

/** Names are compared case-insensitively ("chidiebere" === "Chidiebere"). */
export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Returns the list with `item` removed if present, otherwise added. */
export function toggleInList(
  list: SavedName[],
  item: { name: string; short_meaning: string },
  now: number = Date.now()
): SavedName[] {
  return list.some((n) => sameName(n.name, item.name))
    ? list.filter((n) => !sameName(n.name, item.name))
    : [...list, { ...item, savedAt: now }];
}
