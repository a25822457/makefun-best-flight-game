// A small seeded random number generator (mulberry32): the same seed gives the
// same canyon, which is what makes the screenshot scenes repeatable and the
// daily track identical for every pilot who flies it.

// Notes: mulberry32 is tiny, fast and good enough for a canyon that only
// needs to look random, not be random. The seed is the whole track: the same
// seed always builds the same canyon, rings, spires and fuel cells, which is
// what the screenshot scenes and the daily track rely on.
export function createRandom(seed) {
  let state = seed | 0;
  return function random() {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
