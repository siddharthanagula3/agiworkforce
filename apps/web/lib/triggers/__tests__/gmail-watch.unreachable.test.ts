import { beforeEach, describe, expect, it, vi } from 'vitest';

type OAuthAccessModule = typeof import('@/lib/connectors/oauth-access');

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({ resolve: vi.fn() }));

vi.mock('@/lib/connectors/oauth-access', async (importOriginal) => ({
  ...(await importOriginal<OAuthAccessModule>()),
  resolveConnectorAccessToken: mocks.resolve,
}));

import { GMAIL_PUBSUB_TOPIC_ENV, registerGmailWatch } from '../gmail-watch';
import type { EventTrigger } from '../trigger-types';

const TRIGGER = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: 'user-1',
  source: 'gmail',
  sourceAccount: 'person@example.com',
} as EventTrigger;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv(GMAIL_PUBSUB_TOPIC_ENV, 'projects/agi/topics/gmail');
});

describe('registerGmailWatch when the Gmail token cannot be refreshed right now', () => {
  it('records a retry message instead of asking the owner to reconnect', async () => {
    mocks.resolve.mockResolvedValue({ status: 'unreachable' });
    const query = vi.fn(async () => []);

    await registerGmailWatch({ query } as never, TRIGGER, { restart: true });

    const [, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(params[2]).toBe('Gmail could not be reached. Try again later.');
  });
});
