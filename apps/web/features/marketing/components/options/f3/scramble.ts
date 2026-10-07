const MULTIPLIER = 1664525;
const INCREMENT = 1013904223;
const MODULUS = 2 ** 32;
const FIXED_CHARACTERS = /[\s·$,%()]/;

export function scramble(text: string, seed: number): string {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, MULTIPLIER) + INCREMENT) >>> 0;
    return state / MODULUS;
  };
  const chars = [...text];
  const positions: number[] = [];
  const pool: string[] = [];
  chars.forEach((char, index) => {
    if (FIXED_CHARACTERS.test(char)) return;
    positions.push(index);
    pool.push(char);
  });
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    const a = pool[i] ?? '';
    pool[i] = pool[j] ?? '';
    pool[j] = a;
  }
  positions.forEach((position, k) => {
    chars[position] = pool[k] ?? '';
  });
  return chars.join('');
}
