import { describe, expect, it, vi } from 'vitest';
import { recordedPageKey, replayRecordedPages } from '../src/features/shortcuts/recordedPages';
import type { RunPageActionsMessage } from '../src/types';

describe('multi-page replay', () => {
  const a = 'https://a.example/path';
  const b = 'https://b.example/next';
  async function plan(): Promise<RunPageActionsMessage> {
    return {
      type: 'RUN_PAGE_ACTIONS',
      taskId: 'qa',
      actions: await Promise.all(
        [a, b].map(async (url, i) => ({
          id: String(i),
          type: 'click',
          selector: '#test',
          recordedOrigin: new URL(url).origin,
          recordedPage: await recordedPageKey(url),
        })),
      ),
    };
  }
  it('rechecks access on the destination before issuing its recorded action', async () => {
    let url = a;
    const send = vi.fn(async () => {
      url = b;
      return { success: true };
    });
    const result = await replayRecordedPages(
      await plan(),
      async () => url,
      async (value) => value !== b,
      send,
      () => {},
    );
    expect(result.success).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedOrigin: new URL(a).origin,
        expectedPage: await recordedPageKey(a),
      }),
    );
  });
  it('never dispatches the initial action to a different document on the same origin', async () => {
    const send = vi.fn();
    const result = await replayRecordedPages(
      await plan(),
      async () => a + '?other',
      async () => true,
      send,
      () => {},
    );
    expect(result.success).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});
