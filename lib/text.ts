/** Escape SQL LIKE/ILIKE wildcards (\ % _) so a value is matched literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
