
export type RandomBytesSource = (byteCount: number) => Uint8Array;

let injectedRandom: RandomBytesSource | null = null;

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

let lastTimestampMs = -1;
let counter = 0;

const HEX: string[] = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

export function uuidv7(): string {
  let ms = Date.now();

  if (ms > lastTimestampMs) {
    lastTimestampMs = ms;
    counter = 0;
  } else {
    counter += 1;
    if (counter > 0xfff) {
      lastTimestampMs += 1;
      ms = lastTimestampMs;
      counter = 0;
    } else {
      ms = lastTimestampMs;
    }
  }

  const bytes = new Uint8Array(16);

  bytes[0] = Math.floor(ms / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(ms / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(ms / 2 ** 24) & 0xff;
  bytes[3] = Math.floor(ms / 2 ** 16) & 0xff;
  bytes[4] = Math.floor(ms / 2 ** 8) & 0xff;
  bytes[5] = ms & 0xff;

  bytes[6] = 0x70 | ((counter >> 8) & 0x0f);
  bytes[7] = counter & 0xff;

  const rand = randomBytes(8);
  bytes[8] = 0x80 | ((rand[0] ?? 0) & 0x3f);
  bytes[9] = rand[1] ?? 0;
  bytes[10] = rand[2] ?? 0;
  bytes[11] = rand[3] ?? 0;
  bytes[12] = rand[4] ?? 0;
  bytes[13] = rand[5] ?? 0;
  bytes[14] = rand[6] ?? 0;
  bytes[15] = rand[7] ?? 0;

  let hex = '';
  for (const b of bytes) {
    hex += HEX[b] ?? '00';
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

const UUID_V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidV7(value: string): boolean {
  return UUID_V7_RE.test(value);
}

export function uuidV7TimestampMs(value: string): number {
  const hex = value.replace(/-/g, '').slice(0, 12);
  return parseInt(hex, 16);
}
