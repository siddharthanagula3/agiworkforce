/**
 * UUIDv7 — time-ordered, client-generatable cloud identity (RFC 9562).
 *
 * Why v7 (not v4): cross-device cloud sync needs IDs that are globally unique
 * AND offline-generatable (no server round-trip / autoincrement) AND
 * time-sortable (good Postgres B-tree locality + a natural creation order before
 * timestamps reconcile). See docs/plans/cross-device-cloud-sync-design-2026-06-20.md.
 *
 * Layout (128 bits):
 *   48 bits  unix_ts_ms (big-endian)
 *    4 bits  version (0b0111 = 7)
 *   12 bits  rand_a — used here as a per-millisecond monotonic counter so IDs
 *            minted in the same ms still sort strictly in creation order
 *    2 bits  variant (0b10)
 *   62 bits  rand_b (CSPRNG) — makes cross-process/device collisions negligible
 *
 * CSPRNG: defaults to `globalThis.crypto.getRandomValues` (web, Node ≥19). React
 * Native has no global crypto, so the mobile app injects expo-crypto once at
 * startup via `setUuidV7RandomSource`. If no CSPRNG is configured we THROW rather
 * than fall back to `Math.random` — a weak RNG here would risk ID collisions
 * across devices, which silently corrupts sync.
 */

export type RandomBytesSource = (byteCount: number) => Uint8Array;

let injectedRandom: RandomBytesSource | null = null;

/**
 * Inject a cryptographically-secure random-bytes source. Call once at app
 * startup on platforms without a global Web Crypto (React Native):
 *   import * as Crypto from 'expo-crypto';
 *   setUuidV7RandomSource((n) => Crypto.getRandomBytes(n));
 */
export function setUuidV7RandomSource(source: RandomBytesSource): void {
  injectedRandom = source;
}

function randomBytes(byteCount: number): Uint8Array {
  if (injectedRandom) return injectedRandom(byteCount);
  const webCrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (webCrypto?.getRandomValues) {
    return webCrypto.getRandomValues(new Uint8Array(byteCount));
  }
  throw new Error(
    'uuidv7: no CSPRNG available. On React Native, call setUuidV7RandomSource() ' +
      'with expo-crypto at startup; never fall back to Math.random for sync IDs.',
  );
}

// Monotonic state: strictly non-decreasing timestamp + a 12-bit intra-ms counter.
let lastTimestampMs = -1;
let counter = 0; // 0..0xFFF (12 bits)

const HEX: string[] = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

/**
 * Generate a UUIDv7 string (lowercase, canonical 8-4-4-4-12 form).
 *
 * Monotonic within a process: two calls in the same millisecond produce strictly
 * increasing IDs (via the 12-bit counter); a millisecond can mint up to 4096 IDs
 * before the counter borrows into the next millisecond.
 */
export function uuidv7(): string {
  let ms = Date.now();

  if (ms > lastTimestampMs) {
    lastTimestampMs = ms;
    counter = 0;
  } else {
    // Same (or backwards) clock tick: keep IDs strictly increasing.
    counter += 1;
    if (counter > 0xfff) {
      // Counter exhausted this ms — borrow into the next ms to preserve order.
      lastTimestampMs += 1;
      ms = lastTimestampMs;
      counter = 0;
    } else {
      ms = lastTimestampMs;
    }
  }

  const bytes = new Uint8Array(16);

  // 48-bit big-endian millisecond timestamp. Number is < 2^48, safe in a double.
  bytes[0] = Math.floor(ms / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(ms / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(ms / 2 ** 24) & 0xff;
  bytes[3] = Math.floor(ms / 2 ** 16) & 0xff;
  bytes[4] = Math.floor(ms / 2 ** 8) & 0xff;
  bytes[5] = ms & 0xff;

  // version (7) in the high nibble of byte 6 + top 4 bits of the 12-bit counter.
  bytes[6] = 0x70 | ((counter >> 8) & 0x0f);
  bytes[7] = counter & 0xff;

  // 8 random bytes for the variant + rand_b field. (`?? 0` is a no-op for the
  // fixed-length array — it only satisfies noUncheckedIndexedAccess.)
  const rand = randomBytes(8);
  // variant (0b10) in the top 2 bits of byte 8; keep the rest random.
  bytes[8] = 0x80 | ((rand[0] ?? 0) & 0x3f);
  bytes[9] = rand[1] ?? 0;
  bytes[10] = rand[2] ?? 0;
  bytes[11] = rand[3] ?? 0;
  bytes[12] = rand[4] ?? 0;
  bytes[13] = rand[5] ?? 0;
  bytes[14] = rand[6] ?? 0;
  bytes[15] = rand[7] ?? 0;

  // Build the canonical 8-4-4-4-12 hex string. Iterating the Uint8Array yields a
  // number per byte; HEX is a complete 0..255 lookup (`?? '00'` never triggers).
  let hex = '';
  for (const b of bytes) {
    hex += HEX[b] ?? '00';
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

const UUID_V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** True if `value` is a canonical UUIDv7 (version nibble 7, RFC 4122/9562 variant). */
export function isUuidV7(value: string): boolean {
  return UUID_V7_RE.test(value);
}

/** Extract the embedded creation timestamp (ms since epoch) from a UUIDv7. */
export function uuidV7TimestampMs(value: string): number {
  const hex = value.replace(/-/g, '').slice(0, 12);
  return parseInt(hex, 16);
}
