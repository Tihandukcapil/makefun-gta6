// Seeded randomness (splitmix32) for the city layout, traffic and staged
// screenshots: the same seed always rebuilds the same Marisol Bay, a new
// seed builds a different one. No Math.random anywhere in the game.

export function createRandom(seed = 1) {
  let s = seed >>> 0;
  if (s === 0) s = 0x9e3779b9;

  // One unsigned 32-bit draw, splitmix32.
  function nextUint() {
    s = (s + 0x9e3779b9) | 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    return (z ^ (z >>> 15)) >>> 0;
  }

  // A float in [0, 1).
  function next() {
    return nextUint() / 4294967296;
  }

  return {
    next,
    nextUint,
    // A float in [min, max).
    range(min, max) {
      return min + next() * (max - min);
    },
    // An integer in [min, max], both ends included.
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    // One element of an array, picked uniformly.
    pick(items) {
      return items[(next() * items.length) | 0];
    },
    // True with probability p.
    chance(p) {
      return next() < p;
    },
    // A shuffled copy; the input array is left alone.
    shuffle(items) {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = (next() * (i + 1)) | 0;
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
      }
      return out;
    },
  };
}
