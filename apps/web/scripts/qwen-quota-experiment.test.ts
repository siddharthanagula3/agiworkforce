// @vitest-environment node

import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { getProviderOfferings } from '@agiworkforce/types';
import { runQwenQuotaProbe, streamQwenQuotaChat } from '@agiworkforce/providers-factory';
import { claimQuotaProbe, validateQuotaProbeAuthorization } from './qwen-quota-experiment';
import pools from '../config/free-pools.json';

const policy = pools.quotaExperimentPolicy;
const key = 'fixture-credential';
const now = Date.UTC(2026, 8, 19);
const offerings = getProviderOfferings();
const offeringFor = (protocol: string) =>
  Object.entries(offerings).find(([, entry]) => entry.quotaProbeProtocol === protocol)![0];
const chat = offeringFor('chat');
const image = Object.entries(offerings).find(
  ([, entry]) => entry.quotaProbeProtocol === 'image-sync' && !entry.quotaImageSize,
)![0];
const video = offeringFor('video-async');

function verification() {
  return {
    sourceUrl: 'https://home.qwencloud.com/benefits',
    checkedAtMs: now,
    credentialSha256: createHash('sha256').update(key).digest('hex'),
    offerings: [chat, image, video].map((offeringKey) => ({
      offeringKey,
      quotaOnly: true,
      unit: offeringKey === chat ? 'tokens' : offeringKey === video ? 'seconds' : 'images',
      remaining: 1000,
      expiresAtMs: now + 86_400_000,
    })),
  };
}

describe('bounded quota experiment authorization', () => {
  it('accepts current account-bound evidence but rejects a screenshot alone, another key, stale/future checks and insufficient allocation', () => {
    expect(() =>
      validateQuotaProbeAuthorization(verification(), key, chat, policy, now),
    ).not.toThrow();
    expect(() =>
      validateQuotaProbeAuthorization(pools.inventory, key, chat, policy, now),
    ).toThrow();
    expect(() =>
      validateQuotaProbeAuthorization(verification(), 'other-key', chat, policy, now),
    ).toThrow();
    expect(() =>
      validateQuotaProbeAuthorization(
        verification(),
        key,
        chat,
        policy,
        now + policy.verificationMaxAgeMs,
      ),
    ).toThrow();
    expect(() =>
      validateQuotaProbeAuthorization(verification(), key, chat, policy, now - 1),
    ).toThrow();
    const insufficient = verification();
    insufficient.offerings[0]!.remaining = 0;
    expect(() => validateQuotaProbeAuthorization(insufficient, key, chat, policy, now)).toThrow();
  });

  it('rejects disabled quota protection, expiry, duplicates and unresolved identities', () => {
    const disabled = verification();
    disabled.offerings[0]!.quotaOnly = false;
    expect(() => validateQuotaProbeAuthorization(disabled, key, chat, policy, now)).toThrow();
    const expired = verification();
    expired.offerings[0]!.expiresAtMs = now;
    expect(() => validateQuotaProbeAuthorization(expired, key, chat, policy, now)).toThrow();
    const wrongUnit = verification();
    wrongUnit.offerings[0]!.unit = 'images';
    expect(() => validateQuotaProbeAuthorization(wrongUnit, key, chat, policy, now)).toThrow();
    const duplicate = verification();
    duplicate.offerings.push(duplicate.offerings[0]!);
    expect(() => validateQuotaProbeAuthorization(duplicate, key, chat, policy, now)).toThrow();
    const unresolved = Object.entries(offerings).find(([, entry]) => !entry.quotaProbeProtocol)![0];
    expect(() =>
      validateQuotaProbeAuthorization(verification(), key, unresolved, policy, now),
    ).toThrow();
  });

  it('allows only one concurrent claim for an offering and verification', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'quota-probe-'));
    try {
      const results = await Promise.allSettled([
        claimQuotaProbe(directory, 'same-run'),
        claimQuotaProbe(directory, 'same-run'),
      ]);
      expect(results.filter((entry) => entry.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((entry) => entry.status === 'rejected')).toHaveLength(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe('direct provider experiments without paid fallback', () => {
  it('uses the exact offering ID and bounded output without tools or thinking', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '42. A paper boat floats.' } }],
          usage: { total_tokens: 40 },
        }),
      ),
    );
    const result = await runQwenQuotaProbe(chat, key, policy, transport);
    expect(result.status).toBe('succeeded');
    const [url, request] = transport.mock.calls[0]!;
    expect(new URL(String(url)).pathname).toBe('/compatible-mode/v1/chat/completions');
    const body = JSON.parse(String(request!.body));
    expect(body.model).toBe(offerings[chat]!.providerModelId);
    expect(body.max_tokens).toBe(policy.maxOutputTokens);
    expect(body.enable_thinking).toBe(false);
    expect(body.tools).toBeUndefined();
    expect(request!.redirect).toBe('error');
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('stops on quota exhaustion without fallback or retry for both response shapes', async () => {
    for (const response of [
      { code: 'AllocationQuota.FreeTierOnly' },
      { error: { code: 'AllocationQuota.FreeTierOnly' } },
    ]) {
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(JSON.stringify(response), { status: 403 }));
      expect((await runQwenQuotaProbe(chat, key, policy, transport)).status).toBe(
        'quota_exhausted',
      );
      expect(transport).toHaveBeenCalledTimes(1);
    }
  });

  it('disables paid prompt extension for image generation', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: {
            choices: [{ message: { content: [{ image: 'https://example.com/fixture.png' }] } }],
          },
        }),
      ),
    );
    const result = await runQwenQuotaProbe(image, key, policy, transport);
    expect(result.status).toBe('succeeded');
    const body = JSON.parse(String(transport.mock.calls[0]![1]!.body));
    expect(body.parameters).toEqual({ prompt_extend: false, size: policy.imageSize, n: 1 });
    expect(body.model).toBe(offerings[image]!.providerModelId);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('submits a short video once and polls only its returned task', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ output: { task_id: 'fixture-task', task_status: 'PENDING' } }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output: { task_status: 'SUCCEEDED', video_url: 'https://example.com/fixture.mp4' },
          }),
        ),
      );
    const result = await runQwenQuotaProbe(video, key, policy, transport, async () => {});
    expect(result.status).toBe('succeeded');
    expect(JSON.parse(String(transport.mock.calls[0]![1]!.body)).parameters).toMatchObject({
      duration: policy.videoSeconds,
      prompt_extend: false,
    });
    expect(transport.mock.calls[1]![1]!.method).toBe('GET');
    expect(new URL(String(transport.mock.calls[1]![0])).pathname).toBe(
      '/api/v1/tasks/fixture-task',
    );
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('preserves submitted task identity when polling is interrupted', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ output: { task_id: 'fixture-task', task_status: 'PENDING' } }),
        ),
      )
      .mockRejectedValueOnce(new Error('network interrupted'));
    expect(await runQwenQuotaProbe(video, key, policy, transport, async () => {})).toMatchObject({
      status: 'submitted',
      taskId: 'fixture-task',
    });
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('stops polling at its finite limit without submitting a replacement task', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () =>
          new Response(
            JSON.stringify({ output: { task_id: 'fixture-task', task_status: 'PENDING' } }),
          ),
      );
    const result = await runQwenQuotaProbe(
      video,
      key,
      { ...policy, maxPolls: 2 },
      transport,
      async () => {},
    );
    expect(result).toMatchObject({ status: 'submitted', taskId: 'fixture-task' });
    expect(transport.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(
      1,
    );
    expect(transport).toHaveBeenCalledTimes(3);
  });
});

describe('selected free stream', () => {
  it('sends the exact selection and user text once with bounded output and no tools', async () => {
    const transport = vi.fn().mockResolvedValue(new Response('data: [DONE]\n\n'));
    const messages = [{ role: 'user' as const, content: 'A new user prompt' }];
    const response = await streamQwenQuotaChat(chat, key, policy, { messages }, transport);
    expect(response.ok).toBe(true);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(JSON.parse(transport.mock.calls[0]![1].body)).toEqual({
      model: offerings[chat]!.providerModelId,
      messages,
      max_tokens: policy.maxOutputTokens,
      enable_thinking: false,
      stream: true,
      stream_options: { include_usage: true },
    });
  });
  it('uses catalog-specific image dimensions and the actual user prompt', async () => {
    const custom = Object.entries(offerings).find(([, entry]) => entry.quotaImageSize)![0];
    const transport = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: {
            choices: [{ message: { content: [{ image: 'https://example.com/generated.png' }] } }],
          },
        }),
      ),
    );
    await runQwenQuotaProbe(custom, key, policy, transport, undefined, {
      messages: [{ role: 'user', content: 'A red kite' }],
    });
    const body = JSON.parse(transport.mock.calls[0]![1].body);
    expect(body.parameters).toEqual({
      n: 1,
      prompt_extend: false,
      size: offerings[custom]!.quotaImageSize,
    });
    expect(body.input.messages[0].content).toEqual([{ text: 'A red kite' }]);
  });
});

describe('reasoning-specific quota transport', () => {
  it('bounds required thinking instead of sending an invalid non-thinking flag', async () => {
    const required = Object.entries(offerings).find(([, entry]) => entry.quotaThinkingRequired)![0];
    const transport = vi.fn().mockResolvedValue(new Response('data: [DONE]\n\n'));
    await streamQwenQuotaChat(
      required,
      key,
      policy,
      { messages: [{ role: 'user', content: 'Calculate 2 + 2.' }] },
      transport,
    );
    expect(JSON.parse(transport.mock.calls[0]![1].body)).toMatchObject({
      enable_thinking: true,
      thinking_budget: policy.maxOutputTokens,
      max_tokens: policy.maxOutputTokens,
      stream: true,
    });
    await expect(runQwenQuotaProbe(required, key, policy, transport)).rejects.toThrow(
      'composer streaming route',
    );
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
