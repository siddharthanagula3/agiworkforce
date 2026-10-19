import { describe, expect, it } from 'vitest';
import { WorkspaceConsentStore } from '../features/permissions/workspaceConsent';

function memento() {
  const values = new Map<string, unknown>();
  return {
    get: <T>(key: string): T | undefined => values.get(key) as T | undefined,
    update: (key: string, value: unknown) => {
      values.set(key, value);
      return Promise.resolve();
    },
    keys: () => [...values.keys()],
  };
}

describe('WorkspaceConsentStore', () => {
  it('records the moment a trusted folder is first seen and keeps it', () => {
    let now = 1_000;
    const store = new WorkspaceConsentStore(
      memento(),
      () => true,
      () => now,
    );
    expect(store.consentAtMs('/repo')).toBe(1_000);
    now = 5_000;
    expect(store.consentAtMs('/repo')).toBe(1_000);
    expect(store.consentAtMs('/other')).toBe(5_000);
  });

  it('withholds consent while the workspace is untrusted', () => {
    const state = memento();
    const store = new WorkspaceConsentStore(
      state,
      () => false,
      () => 1_000,
    );
    expect(store.consentAtMs('/repo')).toBeUndefined();
    expect(state.keys()).toEqual([]);
  });

  it('moves consent to the moment trust is granted again', async () => {
    let now = 1_000;
    const store = new WorkspaceConsentStore(
      memento(),
      () => true,
      () => now,
    );
    store.consentAtMs('/repo');
    now = 9_000;
    await store.recordGrant(['/repo']);
    expect(store.consentAtMs('/repo')).toBe(9_000);
  });
});
