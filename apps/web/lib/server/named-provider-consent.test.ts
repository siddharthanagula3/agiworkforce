// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { NAMED_PROVIDER_CONSENT_NAMESPACE } from '@/lib/named-provider-consent';
import { acceptedProviderConsent } from '@/test/free-quota-fixtures';
import { loadNamedProviderConsent } from './named-provider-consent';

type SettingsDb = Parameters<typeof loadNamedProviderConsent>[0];

const USER_ID = 'fixture-user';
const NOW = Date.UTC(2026, 9, 5, 9);

function settingsDb(rows: unknown[] | Error) {
  const query = vi.fn(async (_sql: string, _params?: unknown[]) => {
    if (rows instanceof Error) throw rows;
    return rows;
  });
  return { query, db: { query } as unknown as SettingsDb };
}

describe('reading the agreement on the server', () => {
  it("reads one namespace of the caller's own settings row", async () => {
    const consent = acceptedProviderConsent('qwen', NOW);
    const { query, db } = settingsDb([{ consent: { qwen: consent } }]);

    expect(await loadNamedProviderConsent(db, USER_ID, 'qwen')).toEqual(consent);
    const [sql, params] = query.mock.calls[0]!;
    expect(sql).toMatch(/from public\.user_settings\s+where user_id = \$1/);
    expect(params).toEqual([USER_ID, NAMED_PROVIDER_CONSENT_NAMESPACE]);
  });

  it.each([
    ['the account has no settings row', []],
    ['the namespace was never written', [{ consent: null }]],
    ['the stored value is not a record', [{ consent: { qwen: 'accepted' } }]],
  ])('reads no agreement when %s', async (_label, rows) => {
    expect(await loadNamedProviderConsent(settingsDb(rows).db, USER_ID, 'qwen')).toBeNull();
  });

  it('lets a failed read reach the caller, which refuses the turn', async () => {
    const { db } = settingsDb(new Error('database unreachable'));

    await expect(loadNamedProviderConsent(db, USER_ID, 'qwen')).rejects.toThrow(
      'database unreachable',
    );
  });
});
