// Complete `typed` against a list of candidate words. Returns the completed
// word (or the longest shared prefix), plus all matches.
export function completeWord(typed, candidates) {
  const matches = candidates.filter((c) => c.toLowerCase().startsWith(typed.toLowerCase()));
  if (!matches.length) return { word: typed, matches };
  if (matches.length === 1) return { word: matches[0] + ' ', matches };
  let prefix = matches[0];
  for (const m of matches) while (!m.toLowerCase().startsWith(prefix.toLowerCase())) prefix = prefix.slice(0, -1);
  return { word: prefix.length > typed.length ? prefix : typed, matches };
}
