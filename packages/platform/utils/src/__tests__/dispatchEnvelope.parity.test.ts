import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createDispatchSession,
  deriveDispatchKey,
  dispatchSigningInput,
  verifyDispatchEnvelope,
} from '../remoteControl/dispatchEnvelope';

interface VectorCase {
  name: string;
  type: string;
  ts: number;
  nonce: string;
  payload: Record<string, unknown>;
  signingInput: string;
  hmac: string;
}

const vectors = JSON.parse(
  readFileSync(new URL('./fixtures/dispatch-envelope-vectors.json', import.meta.url), 'utf8'),
) as {
  pairingCode: string;
  sessionSalt: string;
  pairingSecret: string;
  key: string;
  cases: VectorCase[];
};

const key = deriveDispatchKey(vectors.pairingCode, vectors.sessionSalt, vectors.pairingSecret);

function envelopeFor(entry: VectorCase) {
  return {
    hmac: entry.hmac,
    nonce: entry.nonce,
    payload: entry.payload,
    ts: entry.ts,
    type: entry.type,
    v: 3,
  };
}

describe('dispatch envelope vectors shared with the CLI host', () => {
  it('derives the same key', () => {
    expect(key.toString('hex')).toBe(vectors.key);
  });

  it.each(vectors.cases)('signs $name byte for byte', (entry) => {
    expect(dispatchSigningInput(entry.type, entry.payload, entry.ts, entry.nonce)).toBe(
      entry.signingInput,
    );
    const outcome = verifyDispatchEnvelope(
      createDispatchSession(key),
      envelopeFor(entry),
      entry.ts,
    );
    expect(outcome.ok).toBe(true);
  });

  it.each(vectors.cases)('refuses $name once tampered', (entry) => {
    const tampered = { ...envelopeFor(entry), payload: { ...entry.payload, injected: true } };
    const outcome = verifyDispatchEnvelope(createDispatchSession(key), tampered, entry.ts);
    expect(outcome).toEqual({ ok: false, reason: 'hmac_mismatch' });
  });
});
