import { describe, expect, it } from 'vitest';
import { ONE_TIME_SITE_GRANT_MAX_MS } from '../src/features/computer-use/oneTimeSiteGrants';
import {
  forgetTransientHostPermissions,
  listTransientHostPermissions,
  planTransientSweep,
  recordTransientHostPermission,
  type TransientHostPermissionStorage,
} from '../src/features/computer-use/transientHostPermissions';

const ACME = 'https://acme.example';
const BETA = 'https://beta.example';

function memoryStorage(): TransientHostPermissionStorage {
  const data: Record<string, unknown> = {};
  return {
    get: async (key) => ({ [key]: data[key] }),
    set: async (items) => {
      Object.assign(data, items);
    },
  };
}

describe('transient host permission ledger', () => {
  it('records an origin with an expiry and forgets it by id', async () => {
    const storage = memoryStorage();
    await recordTransientHostPermission('site_once_a', `${ACME}/path`, storage, 1_000);
    expect(await listTransientHostPermissions(storage)).toEqual([
      { id: 'site_once_a', origin: ACME, expiresAtMs: 1_000 + ONE_TIME_SITE_GRANT_MAX_MS },
    ]);
    expect(await forgetTransientHostPermissions(['site_once_a'], storage)).toHaveLength(1);
    expect(await listTransientHostPermissions(storage)).toEqual([]);
  });

  it('ignores origins that are not http or https and drops malformed stored rows', async () => {
    const storage = memoryStorage();
    await recordTransientHostPermission('site_once_a', 'chrome://settings', storage);
    expect(await listTransientHostPermissions(storage)).toEqual([]);
    await storage.set({
      agi_transient_host_permissions: [{ id: 1 }, null, { id: 'x', origin: ACME, expiresAtMs: 5 }],
    });
    expect(await listTransientHostPermissions(storage)).toEqual([
      { id: 'x', origin: ACME, expiresAtMs: 5 },
    ]);
  });
});

describe('transient host permission sweep', () => {
  const entries = [
    { id: 'a', origin: ACME, expiresAtMs: 100 },
    { id: 'b', origin: BETA, expiresAtMs: 900 },
  ];
  const none = new Set<string>();

  it('releases every unheld entry when the panel closes or the worker restarts', () => {
    const plan = planTransientSweep({
      entries,
      keptOrigins: none,
      heldOrigins: none,
      nowMs: 200,
      expiredOnly: false,
    });
    expect(plan.forgetIds).toEqual(['a', 'b']);
    expect(plan.removeOrigins).toEqual([ACME, BETA]);
  });

  it('keeps origins that are on the allowlist with consent, and origins held by a live grant', () => {
    const plan = planTransientSweep({
      entries,
      keptOrigins: new Set([ACME]),
      heldOrigins: new Set([BETA]),
      nowMs: 200,
      expiredOnly: false,
    });
    expect(plan.forgetIds).toEqual(['a']);
    expect(plan.removeOrigins).toEqual([]);
  });

  it('releases only expired entries when asked to', () => {
    const plan = planTransientSweep({
      entries,
      keptOrigins: none,
      heldOrigins: none,
      nowMs: 200,
      expiredOnly: true,
    });
    expect(plan.forgetIds).toEqual(['a']);
    expect(plan.removeOrigins).toEqual([ACME]);
  });

  it('does not remove an origin another unreleased entry still needs', () => {
    const plan = planTransientSweep({
      entries: [
        { id: 'a', origin: ACME, expiresAtMs: 100 },
        { id: 'c', origin: ACME, expiresAtMs: 900 },
      ],
      keptOrigins: none,
      heldOrigins: none,
      nowMs: 200,
      expiredOnly: true,
    });
    expect(plan.forgetIds).toEqual(['a']);
    expect(plan.removeOrigins).toEqual([]);
  });
});
