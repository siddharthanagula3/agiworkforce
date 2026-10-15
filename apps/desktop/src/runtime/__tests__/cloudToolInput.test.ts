import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ElicitationPrompt } from '@agiworkforce/cloud-contracts';

const sendCloudInputResume = vi.fn();

vi.mock('../../api/cloudApi', async (importOriginal) => ({
  ...(await importOriginal<CloudapiModule>()),
  sendCloudInputResume: (...args: unknown[]) => sendCloudInputResume(...args),
}));

import { CloudElicitationBridge, CloudToolInputRegistry } from '../cloudToolInput';

type CloudapiModule = typeof import('../../api/cloudApi');

const RUN_ID = '0190a000-0000-7000-8000-000000000123';

const repoPrompt: ElicitationPrompt = {
  key: 'repo',
  mode: 'form',
  message: 'Which repository?',
  fields: [{ name: 'repo', kind: 'string', required: true }],
};

const linkPrompt: ElicitationPrompt = {
  key: 'auth',
  mode: 'url',
  message: 'Sign in',
  url: 'https://auth.example.com/connect',
  host: 'auth.example.com',
};

function suspendedSink(prompts: ElicitationPrompt[]) {
  return {
    isSuspended: () => true,
    getAccumulatedContent: () => 'Before input.',
    getPendingInputRequests: () => [{ toolCallId: 'tc_1', name: 'github', prompts }],
    getAgentActivity: () => undefined,
    getMessageProjection: () => ({}),
  };
}

describe('CloudElicitationBridge', () => {
  it('resumes only after every prompt of the call is answered', async () => {
    const bridge = new CloudElicitationBridge();
    const answer = vi.fn().mockResolvedValue(undefined);
    const seen: number[] = [];
    bridge.subscribe((requests) => seen.push(requests.length));
    bridge.publish(
      'conv',
      [{ toolCallId: 'tc_1', name: 'github', prompts: [repoPrompt, linkPrompt] }],
      answer,
    );

    await bridge.answer('tc_1', 'repo', { action: 'accept', content: { repo: 'agi/workforce' } });
    expect(answer).not.toHaveBeenCalled();
    await bridge.answer('tc_1', 'auth', { action: 'accept' });

    expect(answer).toHaveBeenCalledWith('tc_1', {
      repo: { action: 'accept', content: { repo: 'agi/workforce' } },
      auth: { action: 'accept' },
    });
    expect(seen.at(-1)).toBe(0);
  });

  it('declines the whole call from one prompt', async () => {
    const bridge = new CloudElicitationBridge();
    const answer = vi.fn().mockResolvedValue(undefined);
    bridge.publish(
      'conv',
      [{ toolCallId: 'tc_1', name: 'github', prompts: [repoPrompt, linkPrompt] }],
      answer,
    );
    await bridge.answer('tc_1', 'repo', { action: 'decline' });
    expect(answer).toHaveBeenCalledWith('tc_1', {
      repo: { action: 'decline' },
      auth: { action: 'decline' },
    });
  });

  it('refuses an answer that breaks the schema and keeps the prompt', async () => {
    const bridge = new CloudElicitationBridge();
    const answer = vi.fn();
    let latest: unknown[] = [];
    bridge.subscribe((requests) => {
      latest = requests;
    });
    bridge.publish('conv', [{ toolCallId: 'tc_1', name: 'github', prompts: [repoPrompt] }], answer);
    await expect(
      bridge.answer('tc_1', 'repo', { action: 'accept', content: { other: 'x' } }),
    ).rejects.toThrow(/was not requested/);
    expect(answer).not.toHaveBeenCalled();
    expect(latest).toHaveLength(1);
  });

  it('withdraws a stopped conversation', () => {
    const bridge = new CloudElicitationBridge();
    let latest: unknown[] = [];
    bridge.subscribe((requests) => {
      latest = requests;
    });
    bridge.publish(
      'conv',
      [{ toolCallId: 'tc_1', name: 'github', prompts: [repoPrompt] }],
      vi.fn(),
    );
    bridge.withdraw('conv');
    expect(latest).toEqual([]);
  });
});

describe('CloudToolInputRegistry', () => {
  beforeEach(() => {
    sendCloudInputResume.mockReset();
  });

  it('posts the answers to the resume-input path and streams the continuation', async () => {
    sendCloudInputResume.mockImplementation(
      (_runId, _inputs, onChunk: (text: string) => void, onDone: () => void) => {
        onChunk(' After input.');
        onDone();
        return Promise.resolve();
      },
    );
    const registry = new CloudToolInputRegistry();
    registry.recordTurnOutcome('conv', RUN_ID, 'model', suspendedSink([repoPrompt]), 'msg_1');
    expect(registry.hasLiveTurn('conv')).toBe(true);

    const outcome = await registry.resolve(
      'conv',
      'tc_1',
      { repo: { action: 'accept', content: { repo: 'agi/workforce' } } },
      () => undefined,
      'https://api.example.com',
      () => undefined,
    );

    expect(sendCloudInputResume).toHaveBeenCalledWith(
      RUN_ID,
      [
        {
          tool_call_id: 'tc_1',
          input_responses: { repo: { action: 'accept', content: { repo: 'agi/workforce' } } },
        },
      ],
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      undefined,
      expect.any(Function),
      expect.any(String),
      undefined,
    );
    expect(outcome?.content).toBe('Before input. After input.');
    expect(outcome?.assistantMessageId).toBe('msg_1');
    expect(registry.hasLiveTurn('conv')).toBe(false);
  });

  it('keeps the other calls answered when a resume fails, so answering the failed one again resumes', async () => {
    const twoRequests = {
      ...suspendedSink([repoPrompt]),
      getPendingInputRequests: () => [
        { toolCallId: 'tc_1', name: 'github', prompts: [repoPrompt] },
        { toolCallId: 'tc_2', name: 'github', prompts: [linkPrompt] },
      ],
    };
    const registry = new CloudToolInputRegistry();
    registry.recordTurnOutcome('conv', RUN_ID, 'model', twoRequests, 'msg_1');
    const answerFirst = { repo: { action: 'accept' as const, content: { repo: 'agi/workforce' } } };
    const answerSecond = { auth: { action: 'accept' as const } };
    const resolve = (toolCallId: string, responses: typeof answerFirst | typeof answerSecond) =>
      registry.resolve(
        'conv',
        toolCallId,
        responses,
        () => undefined,
        'https://api.example.com',
        () => undefined,
      );

    await expect(resolve('tc_1', answerFirst)).resolves.toBeNull();
    sendCloudInputResume.mockImplementationOnce(
      (_runId, _inputs, _onChunk, _onDone, onError: (error: Error) => void) => {
        onError(new Error('offline'));
        return Promise.resolve();
      },
    );
    await expect(resolve('tc_2', answerSecond)).rejects.toThrow('offline');
    expect(registry.runResumedBy('conv', 'tc_2')).toBe(RUN_ID);

    sendCloudInputResume.mockImplementationOnce((_runId, _inputs, _onChunk, onDone: () => void) => {
      onDone();
      return Promise.resolve();
    });
    const outcome = await resolve('tc_2', answerSecond);

    expect(outcome?.runId).toBe(RUN_ID);
    expect(sendCloudInputResume).toHaveBeenLastCalledWith(
      RUN_ID,
      [
        { tool_call_id: 'tc_1', input_responses: answerFirst },
        { tool_call_id: 'tc_2', input_responses: answerSecond },
      ],
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      undefined,
      expect.any(Function),
      expect.any(String),
      undefined,
    );
  });

  it('ignores an answer for a call that is not waiting', async () => {
    const registry = new CloudToolInputRegistry();
    registry.recordTurnOutcome('conv', RUN_ID, 'model', suspendedSink([repoPrompt]), 'msg_1');
    const outcome = await registry.resolve(
      'conv',
      'tc_other',
      {},
      () => undefined,
      'https://api.example.com',
      () => undefined,
    );
    expect(outcome).toBeNull();
    expect(sendCloudInputResume).not.toHaveBeenCalled();
  });
});
