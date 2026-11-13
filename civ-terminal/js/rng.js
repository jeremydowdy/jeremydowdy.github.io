// Seeded random numbers. The whole simulation draws from one stream whose
// position is stored in the game state, so a seed plus the same choices
// always gives the same run.

// xmur3 string hash -> 32-bit integer
export function hashSeed(str) {
  str = String(str);
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

// mulberry32. `holder` is any object with a numeric `rng` field (the game
// state, or a small { rng } object for a separate stream).
export function nextRandom(holder) {
  holder.rng = (holder.rng + 0x6d2b79f5) >>> 0;
  let t = holder.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function makeStream(seed) {
  const holder = { rng: hashSeed(seed) };
  return () => nextRandom(holder);
}

// A fresh seed for a new game: 8 characters, a-z and 0-9.
export function randomSeed() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export function isValidSeed(seed) {
  return typeof seed === 'string' && /^[a-z0-9-]{1,32}$/i.test(seed);
}
