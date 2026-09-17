import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { ChatRequest, ProviderAdapter, StreamChunk } from '@agiworkforce/types';

const emitted = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => {
  const capture = (record: unknown) => {
    if (record && typeof record === 'object') emitted.push(record as Record<string, unknown>);
  };
  return { logger: { info: capture, error: capture, warn: capture, debug: capture } };
});
vi.mock('@/lib/services/agent-notification-service', () => ({
  notifyAgentRunEvent: vi.fn(async () => ({ pushed: false })),
}));
vi.mock('@/lib/services/provider-adapter-service', () => ({
  buildServerProviderAdapter: vi.fn(),
}));

import { startProviderStream } from '@/app/api/llm/v1/chat/completions/lib/adapter-factory';
import { annotateActiveSpan, withSpan } from '@/lib/observability/span';
import {
  CloudAgentDeviceMismatchError,
  claimCloudAgentDeviceCheckpoint,
} from '@/lib/services/cloud-agent-run-service';

const RUN_ID = '0190a000-0000-7000-8000-000000000001';
const DEVICE_ID = 'device-abc';

function spanNamed(name: string): Record<string, unknown> {
  const record = emitted.find((entry) => entry['event'] === 'span' && entry['span_name'] === name);
  if (!record) throw new Error(`no span record named ${name}`);
  return record;
}

function adapterStreaming(chunks: StreamChunk[]): ProviderAdapter {
  return {
    stream: async function* () {
      for (const chunk of chunks) yield chunk;
    },
  } as unknown as ProviderAdapter;
}

const chatRequest = { model: 'fixture-model', messages: [] } as unknown as ChatRequest;

beforeEach(() => {
  emitted.length = 0;
});

describe('provider request id', () => {
  it('records the id the provider issued on the stream start span', async () => {
    const stream = await startProviderStream(
      adapterStreaming([
        { type: 'response-meta', id: 'chatcmpl-provider-42', model: 'served-model' },
        { type: 'text-delta', delta: 'hi' },
      ]),
      chatRequest,
      new AbortController().signal,
      () => new Error('mapped'),
    );
    for await (const chunk of stream) void chunk;

    const start = spanNamed('gen_ai.stream.start');
    expect(start['agi.provider.request_id']).toBe('chatcmpl-provider-42');
    expect(start['gen_ai.response.model']).toBe('served-model');
    expect(start['gen_ai.request.model']).toBe('fixture-model');
  });

  it('counts a provider refusal on the first chunk as a model failure', async () => {
    const recordFailure = vi.spyOn(await import('@/lib/observability/metrics'), 'recordFailure');

    await expect(
      startProviderStream(
        adapterStreaming([{ type: 'error', code: '529', message: 'overloaded' } as StreamChunk]),
        chatRequest,
        new AbortController().signal,
        () => new Error('mapped'),
      ),
    ).rejects.toThrow('mapped');

    expect(recordFailure).toHaveBeenCalledWith('model', '529');
    recordFailure.mockRestore();
  });

  it('leaves the attribute off when the provider sent no id', async () => {
    await startProviderStream(
      adapterStreaming([{ type: 'text-delta', delta: 'hi' }]),
      chatRequest,
      new AbortController().signal,
      () => new Error('mapped'),
    );

    expect(spanNamed('gen_ai.stream.start')).not.toHaveProperty('agi.provider.request_id');
  });
});

describe('annotateActiveSpan', () => {
  it('lands on the innermost open span and nowhere else', async () => {
    await withSpan('outer', { domain: 'model' }, async () => {
      await withSpan('inner', { domain: 'tool' }, () => {
        annotateActiveSpan({ 'session.id': 'conv-1' });
      });
      annotateActiveSpan({ 'agi.turn.id': 'turn-1' });
    });

    expect(spanNamed('inner')['session.id']).toBe('conv-1');
    expect(spanNamed('inner')).not.toHaveProperty('agi.turn.id');
    expect(spanNamed('outer')['agi.turn.id']).toBe('turn-1');
    expect(spanNamed('outer')).not.toHaveProperty('session.id');
  });

  it('is a no-op outside any span', () => {
    expect(() => annotateActiveSpan({ 'session.id': 'conv-1' })).not.toThrow();
  });
});

describe('remote session id', () => {
  it('traces a device step claim with its remote session and device, including a failure', async () => {
    const db = {
      transaction: vi.fn(async () => {
        throw new CloudAgentDeviceMismatchError();
      }),
    } as unknown as DatabaseAdapter;

    await expect(
      claimCloudAgentDeviceCheckpoint(db, {
        userId: 'user-1',
        runId: RUN_ID,
        deviceId: DEVICE_ID,
        results: [{ toolCallId: 'call-1', content: 'notes', isError: false }],
      }),
    ).rejects.toBeInstanceOf(CloudAgentDeviceMismatchError);

    const claim = spanNamed('remote.device_step.claim');
    expect(claim['agi.remote.session_id']).toBe(RUN_ID);
    expect(claim['agi.remote.device_id']).toBe(DEVICE_ID);
    expect(claim['status']).toBe('error');
    expect(claim['error.type']).toBe('CloudAgentDeviceMismatchError');
  });
});
