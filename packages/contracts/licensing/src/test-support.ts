import { ed25519 } from '@noble/curves/ed25519';

import { bytesToBase64, utf8ToBytes } from './bytes';

export interface TestKeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  publicKeyB64: string;
}

export function deriveKeyPairFromSeed(seed: Uint8Array | string): TestKeyPair {
  let privateKey: Uint8Array;
  if (typeof seed === 'string') {
    privateKey = new Uint8Array(32);
    const labelBytes = utf8ToBytes(seed);
    privateKey.set(labelBytes.subarray(0, 32));
  } else {
    if (seed.length !== 32) {
      throw new Error('seed must be exactly 32 bytes');
    }
    privateKey = seed;
  }
  const publicKey = ed25519.getPublicKey(privateKey);
  return { privateKey, publicKey, publicKeyB64: bytesToBase64(publicKey) };
}

export function makeSignedContainer(
  payload: unknown,
  privateKey: Uint8Array,
  format: string,
): Uint8Array {
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = bytesToBase64(utf8ToBytes(payloadJson));
  const signature = ed25519.sign(utf8ToBytes(payloadB64), privateKey);
  const container = {
    format,
    payload: payloadB64,
    signature: bytesToBase64(signature),
  };
  return utf8ToBytes(JSON.stringify(container, null, 2));
}

export function tamperContainerPayload(containerBytes: Uint8Array): Uint8Array {
  const text = new TextDecoder().decode(containerBytes);
  const container = JSON.parse(text) as { format: string; payload: string; signature: string };
  const payloadChars = container.payload.split('');
  let idx = payloadChars.length - 1;
  while (idx >= 0 && payloadChars[idx] === '=') idx -= 1;
  const current = payloadChars[idx];
  payloadChars[idx] = current === 'A' ? 'B' : 'A';
  container.payload = payloadChars.join('');
  return utf8ToBytes(JSON.stringify(container, null, 2));
}
