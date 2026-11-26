// A small seeded random number generator (mulberry32) and 2D value noise built on it,
// so the same seed always builds the same valley — the screenshot scenes are repeatable.

export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic 2D value noise in [-1, 1], from a seeded permutation grid. */
export function createNoise2D(seed) {
  const rand = createRandom(seed);
  const perm = new Uint8Array(512);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) base[i] = i;
  for (let i = 255; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const t = base[i];
    base[i] = base[j];
    base[j] = t;
  }
  for (let i = 0; i < 512; i += 1) perm[i] = base[i & 255];

  function lattice(ix, iy) {
    return perm[(perm[ix & 255] + iy) & 255] / 255;
  }
  function smooth(t) {
    return t * t * (3 - 2 * t);
  }
  function noise(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const a = lattice(ix, iy);
    const b = lattice(ix + 1, iy);
    const c = lattice(ix, iy + 1);
    const d = lattice(ix + 1, iy + 1);
    const u = smooth(fx);
    const v = smooth(fy);
    return ((a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1);
  }
  /** Fractal Brownian motion, 4 octaves. */
  return function fbm(x, y) {
    let sum = 0;
    let amp = 1;
    let freq = 1;
    for (let o = 0; o < 4; o += 1) {
      sum += amp * noise(x * freq, y * freq);
      amp *= 0.5;
      freq *= 2.03;
    }
    return sum / 1.875;
  };
}
