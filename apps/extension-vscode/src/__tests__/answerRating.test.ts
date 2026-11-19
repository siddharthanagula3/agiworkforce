import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';

type ApiModule = typeof import('../utils/api');

vi.mock('../utils/api', async (importOriginal) => ({
  ...(await importOriginal<ApiModule>()),
  getAccountToken: async () => 'token',
  getCloudWebOrigin: () => 'https://agiworkforce.test',
}));
vi.mock('../platform/platformHeaders', () => ({ platformRequestHeaders: () => ({}) }));

import { applyAnswerRating } from '../features/feedback/answerRating';

function memento(): vscode.Memento {
  const values = new Map<string, unknown>();
  return {
    keys: () => [...values.keys()],
    get: (key: string, fallback?: unknown) => (values.has(key) ? values.get(key) : fallback),
    update: async (key: string, value: unknown) => {
      values.set(key, value);
    },
  } as unknown as vscode.Memento;
}

const secrets = {} as vscode.SecretStorage;
const answer = { messageId: 'msg-1', conversationId: 'thread-1' };

describe('removing an answer rating', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(vscode.window, 'showErrorMessage').mockResolvedValue(undefined);
  });

  it('asks the server to delete the stored vote before it clears the pressed state', async () => {
    const state = memento();
    fetchMock.mockResolvedValue({ ok: true });
    await applyAnswerRating(secrets, state, 'up', answer);
    fetchMock.mockClear();

    const settled = await applyAnswerRating(secrets, state, null, answer);

    expect(settled).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string }];
    expect(url).toBe('https://agiworkforce.test/api/feedback?message_id=msg-1');
    expect(init.method).toBe('DELETE');
    fetchMock.mockClear();
    expect(await applyAnswerRating(secrets, state, null, answer)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['an HTTP failure', () => fetchMock.mockResolvedValue({ ok: false, status: 503 })],
    ['a network failure', () => fetchMock.mockRejectedValue(new Error('offline'))],
  ])('keeps the vote shown and says so after %s', async (_name, failNext) => {
    const state = memento();
    fetchMock.mockResolvedValue({ ok: true });
    await applyAnswerRating(secrets, state, 'down', answer);
    failNext();

    const settled = await applyAnswerRating(secrets, state, null, answer);

    expect(settled).toBe('down');
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('not removed'),
    );
    fetchMock.mockResolvedValue({ ok: true });
    expect(await applyAnswerRating(secrets, state, null, answer)).toBeNull();
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://agiworkforce.test/api/feedback?message_id=msg-1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
