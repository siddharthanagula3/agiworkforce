import { describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';

vi.mock('server-only', () => ({}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { openEnvelope, sealEnvelope, type KeyRing } from '../envelope';
import {
  CONNECTOR_SECRET_COLUMNS,
  CONNECTOR_SECRET_PURPOSES,
  openConnectorSecret,
  resealConnectorSecrets,
} from '../connector-secret-reseal';

function ring(): KeyRing {
  return { active: { id: '1', material: randomBytes(32) }, retired: [] };
}

const TARGET = {
  table: 'public.user_custom_connectors',
  column: 'auth_header_enc',
  keyColumn: 'id',
  purpose: 'custom-connector-auth-header',
} as const;

/** A table of sealed values the re-seal reads in key order and updates in place. */
function fakeStore(rows: Record<string, string>) {
  const state = new Map(Object.entries(rows));
  const db = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      const limit = Number(params[0]);
      const after = params.length > 1 ? String(params[1]) : null;
      expect(sql).toContain(TARGET.table);
      return [...state.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .filter(([key]) => after === null || key > after)
        .slice(0, limit)
        .map(([key, sealed]) => ({ key, sealed }));
    }),
    execute: vi.fn(async (_sql: string, params: unknown[] = []) => {
      const [next, key, previous] = params as [string, string, string];
      if (state.get(key) !== previous) return 0;
      state.set(key, next);
      return 1;
    }),
  } as unknown as DatabaseAdapter;
  return { db, state };
}

describe('resealConnectorSecrets', () => {
  it('binds a row sealed before the purpose existed, and the value survives', async () => {
    const keys = ring();
    const unbound = sealEnvelope(keys, 'legacy-bearer-token', 'hex-triple');
    const { db, state } = fakeStore({ 'row-1': unbound });

    const outcome = await resealConnectorSecrets({ db, ring: keys, columns: [TARGET] });

    expect(outcome).toMatchObject({ scanned: 1, rebound: 1, alreadyBound: 0, complete: true });
    const resealed = state.get('row-1');
    expect(resealed).not.toBe(unbound);
    expect(
      openEnvelope(keys, resealed as string, 'hex-triple', {
        value: TARGET.purpose,
        acceptUnbound: false,
      }).plaintext,
    ).toBe('legacy-bearer-token');
  });

  it('is what makes the ciphertext refuse every other purpose', async () => {
    const keys = ring();
    const unbound = sealEnvelope(keys, 'legacy-bearer-token', 'hex-triple');

    expect(
      openEnvelope(keys, unbound, 'hex-triple', {
        value: 'oauth-refresh-token',
        acceptUnbound: true,
      }).plaintext,
    ).toBe('legacy-bearer-token');

    const { db, state } = fakeStore({ 'row-1': unbound });
    await resealConnectorSecrets({ db, ring: keys, columns: [TARGET] });

    expect(() =>
      openEnvelope(keys, state.get('row-1') as string, 'hex-triple', {
        value: 'oauth-refresh-token',
        acceptUnbound: true,
      }),
    ).toThrow();
  });

  it('leaves a row that is already bound alone', async () => {
    const keys = ring();
    const bound = sealEnvelope(keys, 'current-token', 'hex-triple', TARGET.purpose);
    const { db, state } = fakeStore({ 'row-1': bound });

    const outcome = await resealConnectorSecrets({ db, ring: keys, columns: [TARGET] });

    expect(outcome).toMatchObject({ rebound: 0, alreadyBound: 1, complete: true });
    expect(state.get('row-1')).toBe(bound);
  });

  it('records a row that will not open and keeps walking past it', async () => {
    const keys = ring();
    const unbound = sealEnvelope(keys, 'still-readable', 'hex-triple');
    const { db, state } = fakeStore({
      'row-1': sealEnvelope(ring(), 'sealed-under-another-key', 'hex-triple'),
      'row-2': unbound,
    });

    const outcome = await resealConnectorSecrets({ db, ring: keys, columns: [TARGET] });

    expect(outcome.failures).toHaveLength(1);
    expect(outcome.failures[0]).toMatchObject({ id: 'row-1', table: TARGET.table });
    expect(outcome).toMatchObject({ rebound: 1, complete: false });
    expect(state.get('row-2')).not.toBe(unbound);
  });

  it('pages past the batch size rather than re-reading the first batch forever', async () => {
    const keys = ring();
    const rows: Record<string, string> = {};
    for (let index = 0; index < 5; index += 1) {
      rows[`row-${index}`] = sealEnvelope(keys, `token-${index}`, 'hex-triple');
    }
    const { db } = fakeStore(rows);

    const outcome = await resealConnectorSecrets({
      db,
      ring: keys,
      columns: [TARGET],
      batchSize: 2,
    });

    expect(outcome).toMatchObject({ scanned: 5, rebound: 5, complete: true });
  });

  it('covers every declared secret purpose with a column', () => {
    const covered = new Set(CONNECTOR_SECRET_COLUMNS.map((entry) => entry.purpose));
    for (const purpose of CONNECTOR_SECRET_PURPOSES) expect(covered).toContain(purpose);
  });
});

describe('openConnectorSecret', () => {
  it('reports a legacy row as unbound and a current one as bound', () => {
    const keys = ring();
    expect(
      openConnectorSecret(keys, sealEnvelope(keys, 'legacy', 'hex-triple'), 'oauth-access-token'),
    ).toEqual({ plaintext: 'legacy', contextBound: false });
    expect(
      openConnectorSecret(
        keys,
        sealEnvelope(keys, 'current', 'hex-triple', 'oauth-access-token'),
        'oauth-access-token',
      ),
    ).toEqual({ plaintext: 'current', contextBound: true });
  });

  it('refuses a bound ciphertext read under the wrong purpose', () => {
    const keys = ring();
    const sealed = sealEnvelope(keys, 'secret', 'hex-triple', 'oauth-access-token');
    expect(() => openConnectorSecret(keys, sealed, 'oauth-refresh-token')).toThrow();
  });
});
