import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

const webRequire = createRequire(import.meta.url);
const workflowRequire = createRequire(webRequire.resolve('workflow'));
const coreRequire = createRequire(workflowRequire.resolve('@workflow/core'));
const serializerUrl = pathToFileURL(coreRequire.resolve('devalue')).href;

describe('installed workflow serialization', () => {
  it.each(['stringify', 'stringifyAsync'] as const)(
    '%s excludes bytes outside a Buffer view',
    async (method) => {
      const serializer = await import(serializerUrl);
      const backing = new ArrayBuffer(64);
      new Uint8Array(backing).fill(0x7b);
      const visible = Buffer.from(backing, 16, 2);
      visible.set([0x12, 0x34]);

      const encoded = await serializer[method]({ value: visible });
      const decoded = serializer.parse(encoded) as { value: Uint8Array };

      expect(Array.from(decoded.value)).toEqual([0x12, 0x34]);
      expect(Array.from(new Uint8Array(decoded.value.buffer))).toEqual([0x12, 0x34]);
    },
  );

  it('retains shared object identity and ordinary workflow values', async () => {
    const serializer = await import(serializerUrl);
    const shared = { value: 'workflow value' };
    const input = {
      first: shared,
      second: shared,
      count: BigInt(42),
      date: new Date('2026-01-01T00:00:00.000Z'),
      entries: new Map([['entry', shared]]),
      bytes: new Uint8Array([1, 2, 3]),
    };
    const decoded = serializer.parse(serializer.stringify(input)) as typeof input;

    expect(decoded).toEqual(input);
    expect(decoded.first).toBe(decoded.second);
    expect(decoded.entries.get('entry')).toBe(decoded.first);
  });
});
