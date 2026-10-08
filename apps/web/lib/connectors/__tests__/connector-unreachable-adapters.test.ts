import { beforeEach, describe, expect, it, vi } from 'vitest';

type OAuthAccessModule = typeof import('@/lib/connectors/oauth-access');
type OAuthRegistryModule = typeof import('@/lib/connectors/oauth-registry');

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  provider: vi.fn(),
}));

vi.mock('@/lib/connectors/oauth-access', async (importOriginal) => ({
  ...(await importOriginal<OAuthAccessModule>()),
  resolveConnectorAccessToken: mocks.resolve,
}));
vi.mock('@/lib/connectors/oauth-registry', async (importOriginal) => ({
  ...(await importOriginal<OAuthRegistryModule>()),
  getConnectorOAuthProvider: mocks.provider,
}));

import { parseConnectorAuthorizationRequired } from '../connect-required';
import { executeGmailAction, GMAIL_SEND_DRAFT_ACTION } from '../gmail-actions';
import { executeGraphTool, graphAdapterToolNames } from '../microsoft-graph';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolve.mockResolvedValue({ status: 'unreachable' });
  mocks.provider.mockReturnValue({ displayName: 'Outlook' });
});

describe('a transient token refresh failure in the first-party adapters', () => {
  it('tells Outlook users to try again rather than to reconnect', async () => {
    const [toolName] = graphAdapterToolNames('outlook');

    const result = await executeGraphTool('user-1', 'outlook', toolName ?? '', {});

    expect(parseConnectorAuthorizationRequired(result.content)).toBeNull();
    expect(result).toEqual({
      content: "Couldn't reach Outlook just now. It is still connected, so try again in a moment.",
      isError: true,
    });
  });

  it('tells Gmail users to try again rather than to reconnect', async () => {
    const result = await executeGmailAction('user-1', GMAIL_SEND_DRAFT_ACTION, {
      draft_id: 'draft-1',
    });

    expect(parseConnectorAuthorizationRequired(result.content)).toBeNull();
    expect(result).toEqual({
      content: "Couldn't reach Gmail just now. It is still connected, so try again in a moment.",
      isError: true,
    });
  });
});
