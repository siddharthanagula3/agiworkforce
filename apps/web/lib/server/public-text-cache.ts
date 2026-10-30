import 'server-only';

import { createHash } from 'node:crypto';
import { cachedRenderInput } from './render-cache';
import { deploymentId } from './hosting';

const CHUNK_CHARACTERS = 128 * 1024;
const MAX_CHUNKS = 512;
const CHUNKS_IN_FLIGHT = 8;

class PayloadChangedError extends Error {}

interface SourceText {
  text: string | null;
  hash: string;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function cachedPublicText(
  read: (version: number) => Promise<string | null>,
  namespace: string,
): (version: number) => Promise<string | null> {
  const loading = new Map<number, Promise<string | null>>();
  const sources = new Map<number, Promise<SourceText>>();
  const deployment = deploymentId() ?? 'local';

  function source(version: number): Promise<SourceText> {
    let pending = sources.get(version);
    if (!pending) {
      pending = read(version).then((text) => ({ text, hash: text === null ? '' : digest(text) }));
      sources.set(version, pending);
    }
    return pending;
  }

  const chunk = cachedRenderInput(
    async (version: number, expectedDigest: string, index: number) => {
      const current = await source(version);
      if (current.text === null || current.hash !== expectedDigest) throw new PayloadChangedError();
      return current.text.slice(index * CHUNK_CHARACTERS, (index + 1) * CHUNK_CHARACTERS);
    },
    {
      keyParts: [namespace, deployment, 'chunk'],
      tags: [namespace],
      revalidate: false,
    },
  );

  const manifest = cachedRenderInput(
    async (version: number) => {
      const { text, hash } = await source(version);
      if (text === null) return null;
      const count = Math.ceil(text.length / CHUNK_CHARACTERS);
      if (count > MAX_CHUNKS) throw new Error('Public cache payload exceeds its chunk budget');
      await readChunks(version, hash, count);
      return { count, hash };
    },
    {
      keyParts: [namespace, deployment, 'manifest'],
      tags: [namespace],
      revalidate: false,
    },
  );

  async function readChunks(version: number, hash: string, count: number): Promise<string[]> {
    const parts: string[] = [];
    for (let offset = 0; offset < count; offset += CHUNKS_IN_FLIGHT) {
      parts.push(
        ...(await Promise.all(
          Array.from({ length: Math.min(CHUNKS_IN_FLIGHT, count - offset) }, (_, index) =>
            chunk(version, hash, offset + index),
          ),
        )),
      );
    }
    return parts;
  }

  async function load(version: number): Promise<string | null> {
    try {
      const stored = await manifest(version);
      if (stored === null) return null;
      if (!Number.isInteger(stored.count) || stored.count < 0 || stored.count > MAX_CHUNKS) {
        throw new Error('Invalid public cache manifest');
      }
      const fresh = sources.get(version);
      if (fresh) {
        const current = await fresh;
        if (current.hash === stored.hash) return current.text;
      }
      const chunks = await readChunks(version, stored.hash, stored.count);
      const text = chunks.join('');
      if (digest(text) !== stored.hash) throw new PayloadChangedError();
      return text;
    } catch (error) {
      // A snapshot can advance after its manifest was cached and a chunk was evicted.
      if (error instanceof PayloadChangedError) return (await source(version)).text;
      throw error;
    } finally {
      sources.delete(version);
    }
  }

  return (version) => {
    const pending = loading.get(version);
    if (pending) return pending;
    const next = load(version).finally(() => loading.delete(version));
    loading.set(version, next);
    return next;
  };
}
