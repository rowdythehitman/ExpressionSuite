/**
 * Case-insensitive match on a substring or on word prefixes: "pos" → Position, "opa" → Opacity,
 * "ap" → Anchor Point, "accol" → Accent Colour. A plain subsequence was too loose ("rot" hit "AnchoR pOinT").
 */
export function fuzzyMatch(query: string, text: string): boolean {
  const q = query.trim().toLowerCase().replace(/\s+/g, "");
  if (!q) return true;
  const t = text.toLowerCase();
  if (t.includes(q)) return true;
  const isWordStart = (i: number) => i === 0 || /[\s_\-.]/.test(t[i - 1]!) || (/[a-z]/.test(t[i - 1]!) && /[0-9]/.test(t[i]!));

  // Each run of query characters is a prefix of a word; runs jump forward to later word starts.
  const from = (qi: number, ti: number): boolean => {
    if (qi === q.length) return true;
    for (let start = ti; start < t.length; start++) {
      if (!isWordStart(start) || t[start] !== q[qi]) continue;
      let k = 0;
      while (start + k < t.length && qi + k < q.length && t[start + k] === q[qi + k]) {
        k++;
        if (from(qi + k, start + k)) return true;
      }
    }
    return false;
  };
  return from(0, 0);
}
