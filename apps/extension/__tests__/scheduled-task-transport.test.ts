import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createManagedCloudAgentRunClient } from '@agiworkforce/cloud-contracts';
import { getPickerModels, type ManagedUsageSummaryResponse } from '@agiworkforce/types';
import {
  createScheduledTaskTransport,
  ScheduledTaskTransportControl,
} from '../src/features/background/scheduled-task-transport';
import { executeChromeManagedChat } from '../src/features/cloud-bridge/managedChatHandler';
import { streamFreeChat } from '../src/features/cloud-bridge/freeTrialClient';
import { resumeChromeManagedRun } from '../src/features/cloud-bridge/managedRunControl';

const usage: ManagedUsageSummaryResponse = {
  plan_tier: 'pro',
  usage_percentage: 0,
  usage_reset_at: null,
  has_usage_remaining: true,
  period_start: null,
  period_end: null,
  subscription_status: 'active',
  session_usage_percentage: 0,
  session_reset_at: null,
  weekly_usage_percentage: 0,
  weekly_reset_at: null,
  flagship_weekly_usage_percentage: 0,
  flagship_weekly_reset_at: null,
};

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const run = {
  runId: RUN_ID,
  runPath: `/api/llm/v1/chat/completions/runs/${RUN_ID}`,
  lastSequence: -1,
};

function latch() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function drain(stream: AsyncGenerator<unknown>): Promise<void> {
  for await (const _chunk of stream) {
    /* consume */
  }
}

describe('private scheduled transport authority', () => {
  for (const reason of ['denied', 'unavailable']) {
    it(`preserves ${reason} after delayed routing without issuing a POST`, async () => {
      const routingEntered = latch();
      const releaseRouting = latch();
      const original = new Error(reason);
      let revoked = false;
      const nativeFetch = vi.fn(async () => new Response(''));
      const started = vi.fn();
      const transport = createScheduledTaskTransport(
        async () => {
          if (revoked) throw original;
        },
        started,
        () => {},
        nativeFetch,
      );
      const pending = executeChromeManagedChat(
        {
          id: 'scheduled-routing',
          text: 'Summarize the news',
          modelSelection: 'auto',
          idempotencyKey: 'agi.chrome.task.routing',
          completionMode: 'unattended',
        },
        {
          getAuthToken: async () => 'test-token',
          getModelAccess: async () => ({
            subscriptionTier: 'pro',
            usage,
            modelIds: getPickerModels().map((model) => model.id),
            allowedAutoModes: ['auto'],
          }),
          onText: () => {},
          onRouting: async () => {
            routingEntered.resolve();
            await releaseRouting.promise;
          },
          streamChat: (messages, token, options) =>
            streamFreeChat(messages, token, {
              ...(options && 'aborted' in options ? { signal: options } : options),
              fetchImpl: transport.fetch,
            }),
        },
      );
      await routingEntered.promise;
      revoked = true;
      const rejection = expect(pending).rejects.toMatchObject({ original });
      releaseRouting.resolve();
      await rejection;
      expect(nativeFetch).not.toHaveBeenCalled();
      expect(started).not.toHaveBeenCalled();
    });
  }

  it('preserves model-access control before routing or chat dispatch', async () => {
    const control = new ScheduledTaskTransportControl(new Error('unavailable'));
    const streamChat = vi.fn(() => streamFreeChat([], 'test-token'));
    await expect(
      executeChromeManagedChat(
        { id: 'scheduled-model-access', text: 'Hello' },
        {
          getAuthToken: async () => 'test-token',
          getModelAccess: async () => {
            throw control;
          },
          streamChat,
          onText: () => {},
        },
      ),
    ).rejects.toBe(control);
    expect(streamChat).not.toHaveBeenCalled();
  });

  it('does not retry private control in durable follow or convert it in resume', async () => {
    const original = new Error('source temporarily unreadable');
    const guard = vi.fn(async () => {
      throw original;
    });
    const nativeFetch = vi.fn(async () => new Response(''));
    const transport = createScheduledTaskTransport(guard, vi.fn(), () => {}, nativeFetch);
    const wait = vi.fn(async () => {});
    const createClient = () =>
      createManagedCloudAgentRunClient({
        baseUrl: 'https://example.com',
        getAuthToken: async () => 'test-token',
        fetchImpl: transport.fetch,
        wait,
      });
    await expect(
      resumeChromeManagedRun(
        { run, alreadyVisibleText: '' },
        {
          getAuthToken: async () => 'test-token',
          createClient,
        },
      ),
    ).rejects.toMatchObject({ original });
    expect(guard).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
    expect(nativeFetch).not.toHaveBeenCalled();
  });

  it('rechecks currentness after awaited authority before counting I/O', async () => {
    const release = latch();
    const lost = new Error('lease replaced');
    let current = true;
    const nativeFetch = vi.fn(async () => new Response(''));
    const started = vi.fn();
    const transport = createScheduledTaskTransport(
      () => release.promise,
      started,
      () => {
        if (!current) throw lost;
      },
      nativeFetch,
    );
    const pending = transport.fetch('https://example.com');
    const rejection = expect(pending).rejects.toMatchObject({ original: lost });
    current = false;
    release.resolve();
    await rejection;
    expect(started).not.toHaveBeenCalled();
    expect(nativeFetch).not.toHaveBeenCalled();
  });

  it('propagates the exact control wrapper from initial POST', async () => {
    const control = new ScheduledTaskTransportControl(new Error('unavailable'));
    await expect(
      drain(
        streamFreeChat([{ role: 'user', content: 'Hello' }], 'test-token', {
          fetchImpl: async () => {
            throw control;
          },
        }),
      ),
    ).rejects.toBe(control);
  });

  it('keeps private hooks out of payloads and preserves default and cancellation wiring', () => {
    const client = readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../src/features/cloud-bridge/freeTrialClient.ts',
      ),
      'utf8',
    );
    const background = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../src/background.ts'),
      'utf8',
    );
    const control = readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../src/features/cloud-bridge/managedRunControl.ts',
      ),
      'utf8',
    );
    expect(client).toContain('(options.fetchImpl ?? fetch)(resumeEndpoint ?? FREE_TRIAL_ENDPOINT');
    expect(client).toContain('...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {})');
    expect(client).toContain(
      'if (followError instanceof ScheduledTaskTransportControl) throw followError;',
    );
    expect(
      client.match(/if \(error instanceof ScheduledTaskTransportControl\) throw error;/g),
    ).toHaveLength(2);
    expect(background).toMatch(/\.\.\.\(scheduledTransport\s+\?\s+\{/);
    expect(background).toContain(
      'if (error instanceof ScheduledTaskTransportControl) throw error;',
    );
    expect(background).toContain(
      'caught instanceof ScheduledTaskTransportControl ? caught.original : caught',
    );
    const cancel = control.slice(control.indexOf('export async function cancelChromeManagedRun('));
    expect(cancel).not.toContain('createScheduledTaskTransport');
    const streamStart = client.indexOf('export async function* streamFreeChat');
    const payloadStart = client.indexOf('body: JSON.stringify(', streamStart);
    const payloadEnd = client.indexOf('signal: controller.signal,', payloadStart);
    expect(streamStart).toBeGreaterThanOrEqual(0);
    expect(payloadStart).toBeGreaterThan(streamStart);
    expect(payloadEnd).toBeGreaterThan(payloadStart);
    const payload = client.slice(payloadStart, payloadEnd);
    expect(payload).not.toContain('fetchImpl');
  });
});
