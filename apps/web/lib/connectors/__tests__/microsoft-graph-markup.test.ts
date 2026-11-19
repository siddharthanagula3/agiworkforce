import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  fetch: vi.fn(),
}));

type OauthAccessModule = typeof import('@/lib/connectors/oauth-access');
type GuardedFetchModule = typeof import('@/lib/url-fetch/guarded-fetch');

vi.mock('@/lib/connectors/oauth-access', async (importOriginal) => ({
  ...(await importOriginal<OauthAccessModule>()),
  resolveConnectorAccessToken: mocks.resolve,
}));
vi.mock('@/lib/url-fetch/guarded-fetch', async (importOriginal) => ({
  ...(await importOriginal<GuardedFetchModule>()),
  credentialedFetch: mocks.fetch,
}));

import { executeGraphTool } from '../microsoft-graph';

const HOSTILE_BUDGET_MS = 2000;

function chatPayload(content: string): Response {
  return new Response(JSON.stringify({ value: [{ body: { content } }] }), { status: 200 });
}

async function readChatText(content: string): Promise<{ text: string; ms: number }> {
  mocks.fetch.mockResolvedValue({ ok: true, response: chatPayload(content) });
  const started = performance.now();
  const result = await executeGraphTool('user-1', 'teams', 'read_chat_messages', {
    chat_id: 'chat-1',
  });
  const ms = performance.now() - started;
  const body = JSON.parse(
    result.content.slice(result.content.indexOf('{'), result.content.lastIndexOf('}') + 1),
  );
  return { text: body.messages[0].text as string, ms };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolve.mockResolvedValue({
    status: 'ready',
    accessToken: 'token',
    tokenType: 'Bearer',
  });
});

describe('Teams message text from markup', () => {
  it('strips tags and keeps the text around them', async () => {
    const { text } = await readChatText(
      '<p>Hello&nbsp;<b>team</b></p><br/>Ship it &gt; later <img alt="a>b">',
    );
    expect(text).toBe('Hello team Ship it &gt; later b">');
  });

  it('keeps text after a bare less-than with no closing bracket', async () => {
    const { text } = await readChatText('1 < 2 and 3 < 4');
    expect(text).toBe('1 < 2 and 3 < 4');
  });

  it('treats everything from the first less-than to the next greater-than as one tag', async () => {
    const { text } = await readChatText('a <<b> c');
    expect(text).toBe('a c');
  });

  it.each([
    ['<p>Use List<> in Java</p>', 'Use List in Java'],
    ['ab<>cd', 'ab cd'],
    ['1 <', '1 <'],
    ['a <', 'a <'],
    ['a < b', 'a < b'],
  ])('reads the text around an empty or unfinished tag in %j', async (html, expected) => {
    const { text } = await readChatText(html);
    expect(text).toBe(expected);
  });

  it('strips a message made of thousands of unterminated openers in linear time', async () => {
    const { text, ms } = await readChatText(`${'<'.repeat(180_000)}tail`);
    expect(text).toBe(`${'<'.repeat(180_000)}tail`.slice(0, 20_000) + '…');
    expect(ms).toBeLessThan(HOSTILE_BUDGET_MS);
  });
});
