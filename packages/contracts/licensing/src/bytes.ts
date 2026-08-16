
const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP: Record<string, number> = (() => {
  const table: Record<string, number> = {};
  for (let i = 0; i < B64_ALPHABET.length; i += 1) {
    table[B64_ALPHABET.charAt(i)] = i;
  }
  return table;
})();

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

export function utf8ToBytes(value: string): Uint8Array {
  return utf8Encoder.encode(value);
}

export function bytesToUtf8(bytes: Uint8Array): string {
  return utf8Decoder.decode(bytes);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = i + 1 < bytes.length ? (bytes[i + 1] ?? 0) : 0;
    const b2 = i + 2 < bytes.length ? (bytes[i + 2] ?? 0) : 0;
    out += B64_ALPHABET.charAt(b0 >> 2);
    out += B64_ALPHABET.charAt(((b0 & 0x03) << 4) | (b1 >> 4));
    out += i + 1 < bytes.length ? B64_ALPHABET.charAt(((b1 & 0x0f) << 2) | (b2 >> 6)) : '=';
    out += i + 2 < bytes.length ? B64_ALPHABET.charAt(b2 & 0x3f) : '=';
  }
  return out;
}

export function base64ToBytes(value: string): Uint8Array | null {
  if (value.length % 4 !== 0) return null;

  let padding = 0;
  if (value.endsWith('==')) padding = 2;
  else if (value.endsWith('=')) padding = 1;

  const body = padding > 0 ? value.slice(0, value.length - padding) : value;
  for (const ch of body) {
    if (!(ch in B64_LOOKUP)) return null;
  }

  const outLength = (value.length / 4) * 3 - padding;
  const out = new Uint8Array(outLength);
  let outIndex = 0;

  const sextet = (ch: string): number => B64_LOOKUP[ch] ?? 0;

  for (let i = 0; i < value.length; i += 4) {
    const ch2 = value.charAt(i + 2);
    const ch3 = value.charAt(i + 3);
    const c0 = sextet(value.charAt(i));
    const c1 = sextet(value.charAt(i + 1));
    const c2 = ch2 === '=' ? 0 : sextet(ch2);
    const c3 = ch3 === '=' ? 0 : sextet(ch3);

    const triple = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (outIndex < outLength) out[outIndex++] = (triple >> 16) & 0xff;
    if (outIndex < outLength) out[outIndex++] = (triple >> 8) & 0xff;
    if (outIndex < outLength) out[outIndex++] = triple & 0xff;
  }

  return out;
}
