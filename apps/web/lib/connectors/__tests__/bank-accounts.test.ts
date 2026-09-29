import { beforeEach, describe, expect, it, vi } from 'vitest';

interface ItemRow {
  id: string;
  user_id: string;
  plaid_item_id: string | null;
  access_token_enc: string;
  institution_name: string | null;
  excluded_account_ids: string[] | null;
}

type PlaidAnswer = { status?: number; body: unknown };

const state = vi.hoisted(() => ({
  rows: [] as ItemRow[],
  grantToken: null as string | null,
  failInsert: false,
  plaid: {} as Record<string, (body: Record<string, unknown>) => PlaidAnswer>,
  calls: [] as Array<{ path: string; body: Record<string, unknown> }>,
  upsertGrant: vi.fn(),
  revokeGrant: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/connectors/plaid-config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connectors/plaid-config')>()),
  plaidApiOrigin: () => 'https://sandbox.plaid.com',
  plaidCredentials: () => ({
    origin: 'https://sandbox.plaid.com',
    clientId: 'client',
    secret: 'secret',
  }),
}));
vi.mock('@/lib/custom-connector-crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/custom-connector-crypto')>()),
  encryptConnectorToken: (token: string) => `enc:${token}`,
  decryptConnectorToken: (sealed: string) => sealed.replace(/^enc:/, ''),
}));
vi.mock('@/lib/url-fetch/guarded-fetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/url-fetch/guarded-fetch')>()),
  createDeadline: () => ({ release: () => undefined }),
  credentialedFetch: async (url: URL, init: { body: string }) => {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    state.calls.push({ path: url.pathname, body });
    const answer = state.plaid[url.pathname]?.(body) ?? { body: {} };
    return {
      ok: true,
      response: new Response(JSON.stringify(answer.body), { status: answer.status ?? 200 }),
    };
  },
}));
vi.mock('@/lib/connectors/oauth-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connectors/oauth-store')>()),
  getConnectorOAuthGrant: async () => (state.grantToken ? { accessToken: state.grantToken } : null),
  upsertConnectorOAuthGrant: (...args: unknown[]) => {
    state.grantToken = (args[2] as { accessToken: string }).accessToken;
    return state.upsertGrant(...args);
  },
  revokeConnectorOAuthGrant: (...args: unknown[]) => {
    state.grantToken = null;
    return state.revokeGrant(...args);
  },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({
    query: async (sql: string, params: unknown[]) => {
      const [first, second, third] = params as [string, string, unknown];
      if (/insert into public\.bank_account_items/.test(sql)) {
        if (state.failInsert) throw new Error('insert failed');
        const existing =
          second === null ? undefined : state.rows.find((row) => row.plaid_item_id === second);
        if (existing) {
          existing.access_token_enc = third as string;
          return [{ id: existing.id }];
        }
        const id = `00000000-0000-4000-8000-00000000000${state.rows.length + 1}`;
        state.rows.push({
          id,
          user_id: first,
          plaid_item_id: second,
          access_token_enc: third as string,
          institution_name: (params[3] as string | null) ?? null,
          excluded_account_ids: null,
        });
        return [{ id }];
      }
      if (/select count/.test(sql)) {
        return [{ count: state.rows.filter((row) => row.user_id === first).length }];
      }
      if (/update public\.bank_account_items/.test(sql)) {
        const row = state.rows.find((item) => item.id === first && item.user_id === second);
        if (!row) return [];
        row.excluded_account_ids = third as string[];
        return [{ id: row.id }];
      }
      if (/from public\.bank_account_items/.test(sql)) {
        return state.rows.filter((row) => row.user_id === first);
      }
      return [];
    },
    execute: async (sql: string, params: unknown[]) => {
      if (/where id = \$1 and user_id = \$2/.test(sql)) {
        state.rows = state.rows.filter(
          (row) => !(row.id === params[0] && row.user_id === params[1]),
        );
      } else if (/delete from public\.bank_account_items where user_id = \$1/.test(sql)) {
        state.rows = state.rows.filter((row) => row.user_id !== params[0]);
      }
    },
  }),
}));

import {
  connectBankAccounts,
  executeBankAccountsTool,
  removeBankItem,
  setBankItemExcludedAccounts,
} from '../bank-accounts';

const USER = 'user-1';

function seed(id: string, token: string, excluded: string[] | null = null) {
  state.rows.push({
    id,
    user_id: USER,
    plaid_item_id: `item-${token}`,
    access_token_enc: `enc:${token}`,
    institution_name: `Bank ${token}`,
    excluded_account_ids: excluded,
  });
}

const plaidError = (code: string, status = 400): PlaidAnswer => ({
  status,
  body: { error_code: code, display_message: null },
});

const accounts = (...ids: string[]): PlaidAnswer => ({
  body: {
    accounts: ids.map((id) => ({
      account_id: id,
      name: id,
      type: 'depository',
      balances: { available: 1, current: 1, limit: null, iso_currency_code: 'USD' },
    })),
  },
});

const ITEM_A = '00000000-0000-4000-8000-00000000000a';
const ITEM_B = '00000000-0000-4000-8000-00000000000b';

beforeEach(() => {
  state.rows = [];
  state.grantToken = null;
  state.failInsert = false;
  state.plaid = {};
  state.calls = [];
  state.upsertGrant.mockReset();
  state.revokeGrant.mockReset();
});

describe('removing one bank', () => {
  it('keeps the link and answers with curated copy when Plaid refuses the removal', async () => {
    seed(ITEM_A, 'token-a');
    state.plaid['/item/remove'] = () => plaidError('INTERNAL_SERVER_ERROR', 500);

    await expect(removeBankItem(USER, ITEM_A)).rejects.toThrow(
      'The bank could not be removed right now. Try again in a few minutes.',
    );
    expect(state.rows.map((row) => row.id)).toEqual([ITEM_A]);
    expect(state.revokeGrant).not.toHaveBeenCalled();
  });

  it('keeps the link when Plaid does not accept the token, since the item may still be live', async () => {
    seed(ITEM_A, 'token-a');
    state.plaid['/item/remove'] = () => plaidError('INVALID_ACCESS_TOKEN');

    await expect(removeBankItem(USER, ITEM_A)).rejects.toThrow('Try again in a few minutes');
    expect(state.rows.map((row) => row.id)).toEqual([ITEM_A]);
  });

  it('drops the link when Plaid no longer knows the item', async () => {
    seed(ITEM_A, 'token-a');
    state.grantToken = 'token-a';
    state.plaid['/item/remove'] = () => plaidError('ITEM_NOT_FOUND');

    await expect(removeBankItem(USER, ITEM_A)).resolves.toBe(true);
    expect(state.rows).toEqual([]);
    expect(state.revokeGrant).toHaveBeenCalled();
  });

  it('re-points the grant at a remaining bank when the removed bank held its token', async () => {
    seed(ITEM_A, 'token-a');
    seed(ITEM_B, 'token-b');
    state.grantToken = 'token-b';

    await removeBankItem(USER, ITEM_B);

    expect(state.rows.map((row) => row.id)).toEqual([ITEM_A]);
    expect(state.grantToken).toBe('token-a');
    expect(state.revokeGrant).not.toHaveBeenCalled();
  });

  it('removes an older single-link bank under the legacy id', async () => {
    state.grantToken = 'token-legacy';

    await expect(removeBankItem(USER, 'legacy')).resolves.toBe(true);
    expect(state.calls).toContainEqual({
      path: '/item/remove',
      body: { access_token: 'token-legacy' },
    });
    expect(state.revokeGrant).toHaveBeenCalled();
  });
});

describe('choosing accounts', () => {
  it('refuses an account id the bank did not return', async () => {
    seed(ITEM_A, 'token-a');
    state.plaid['/accounts/get'] = () => accounts('acc-1', 'acc-2');

    await expect(setBankItemExcludedAccounts(USER, ITEM_A, ['acc-9'])).resolves.toBe(
      'unknown_account',
    );
    expect(state.rows[0]?.excluded_account_ids).toBeNull();
  });

  it('keeps the chosen accounts out of transaction totals', async () => {
    seed(ITEM_A, 'token-a', ['acc-2']);
    state.plaid['/accounts/get'] = () => accounts('acc-1', 'acc-2');
    state.plaid['/transactions/get'] = () => ({
      body: { transactions: [], total_transactions: 3 },
    });

    await executeBankAccountsTool(USER, 'get_transactions', {
      start_date: '2026-09-01',
      end_date: '2026-09-29',
    });

    const request = state.calls.find((call) => call.path === '/transactions/get');
    expect((request?.body['options'] as { account_ids?: string[] }).account_ids).toEqual(['acc-1']);
  });
});

describe('linking another bank', () => {
  beforeEach(() => {
    state.plaid['/item/public_token/exchange'] = () => ({
      body: { access_token: 'token-new', item_id: 'item-new' },
    });
  });

  it('records the new bank and moves on when the older link is gone at Plaid', async () => {
    state.grantToken = 'token-dead';
    state.plaid['/item/get'] = () => plaidError('ITEM_NOT_FOUND');

    await connectBankAccounts(USER, 'public-token', 'New Bank');

    expect(state.rows.map((row) => row.plaid_item_id)).toEqual(['item-new']);
    expect(state.grantToken).toBe('token-new');
  });

  it('keeps an older link Plaid did not accept, next to the new bank, so it can be removed', async () => {
    state.grantToken = 'token-other-env';
    state.plaid['/item/get'] = () => plaidError('INVALID_ACCESS_TOKEN');

    await connectBankAccounts(USER, 'public-token', 'New Bank');

    expect(state.rows.map((row) => [row.plaid_item_id, row.access_token_enc])).toEqual([
      [null, 'enc:token-other-env'],
      ['item-new', 'enc:token-new'],
    ]);
    expect(state.grantToken).toBe('token-new');
  });

  it('removes the new item at Plaid when it cannot be recorded', async () => {
    state.failInsert = true;

    await expect(connectBankAccounts(USER, 'public-token', 'New Bank')).rejects.toThrow(
      'insert failed',
    );
    expect(state.calls).toContainEqual({
      path: '/item/remove',
      body: { access_token: 'token-new' },
    });
    expect(state.upsertGrant).not.toHaveBeenCalled();
  });
});
