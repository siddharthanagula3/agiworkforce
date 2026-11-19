const mockApiFetch = jest.fn();
jest.mock('@/services/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

import {
  CHAT_CODE_RUN_APPROVAL_REQUIRED_CODE,
  CHAT_CODE_RUN_APPROVAL_REQUIRED_MESSAGE,
  CHAT_CODE_RUN_MAX_DURATION_SECONDS,
} from '@agiworkforce/cloud-contracts';
import { CODE_RUN_FAILED, runCodeAgain } from '@/src/features/chat/services/codeRun';

function respond(status: number, body: unknown) {
  mockApiFetch.mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

function sentBody(): Record<string, unknown> {
  const init = mockApiFetch.mock.calls[0]![1] as { body: string };
  return JSON.parse(init.body) as Record<string, unknown>;
}

describe('runCodeAgain', () => {
  const signal = new AbortController().signal;
  beforeEach(() => mockApiFetch.mockReset());

  it('sends approved: true only when the person approved the run', async () => {
    respond(200, { ok: true, output: '1', error: null, images: [] });
    await runCodeAgain({
      conversationId: 'conv 1',
      language: 'python',
      code: 'print(1)',
      signal,
      approved: true,
    });
    expect(mockApiFetch.mock.calls[0]![0]).toBe('/api/chat/conversations/conv%201/code-runs');
    expect(sentBody()).toEqual({ language: 'python', code: 'print(1)', approved: true });
  });

  it('leaves the approved key out otherwise', async () => {
    respond(200, { ok: true, output: '1', error: null, images: [] });
    await runCodeAgain({ conversationId: 'c', language: 'python', code: 'print(1)', signal });
    expect(sentBody()).toEqual({ language: 'python', code: 'print(1)' });
  });

  it('waits as long as the server lets a run take', async () => {
    respond(200, { ok: true, output: '', error: null, images: [] });
    await runCodeAgain({ conversationId: 'c', language: 'python', code: 'x', signal });
    expect(mockApiFetch.mock.calls[0]![2]).toEqual({
      timeout: CHAT_CODE_RUN_MAX_DURATION_SECONDS * 1000,
    });
  });

  it('marks the approval-required refusal so the phone can ask first', async () => {
    respond(409, {
      error: {
        code: CHAT_CODE_RUN_APPROVAL_REQUIRED_CODE,
        message: CHAT_CODE_RUN_APPROVAL_REQUIRED_MESSAGE,
      },
    });
    await expect(
      runCodeAgain({ conversationId: 'c', language: 'python', code: 'x', signal }),
    ).resolves.toEqual({
      ok: false,
      message: CHAT_CODE_RUN_APPROVAL_REQUIRED_MESSAGE,
      approvalRequired: true,
    });
  });

  it('falls back to the did-not-run message for other failures', async () => {
    respond(500, { error: { code: 'internal' } });
    await expect(
      runCodeAgain({ conversationId: 'c', language: 'python', code: 'x', signal }),
    ).resolves.toEqual({ ok: false, message: CODE_RUN_FAILED });
  });
});
