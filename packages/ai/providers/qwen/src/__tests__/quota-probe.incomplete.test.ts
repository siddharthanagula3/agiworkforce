import { afterEach, describe, expect, it, vi } from 'vitest';
import { getProviderOfferings, type ProviderOffering } from '@agiworkforce/types';

import { runQwenQuotaProbe, type QwenQuotaProbePolicy } from '../quota-probe';

const catalogue = vi.hoisted(() => ({ replacements: new Map<string, unknown>() }));

vi.mock('@agiworkforce/types', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/types')>();
  return {
    ...actual,
    getProviderOffering: (key: string) =>
      (catalogue.replacements.get(key) as ProviderOffering | undefined) ??
      actual.getProviderOffering(key),
  };
});

const policy: QwenQuotaProbePolicy = {
  maxOutputTokens: 128,
  requestTimeoutMs: 60_000,
  pollIntervalMs: 5_000,
  maxPolls: 24,
};
const callerPolicyHoldingASize = { ...policy, imageSize: '1024*1024' };
const SIZED_VIDEO = 'qwen-quota-009';
const TIERED_VIDEO = 'qwen-quota-235';
const ASYNC_IMAGE = 'qwen-quota-148';
const SYNC_IMAGE = 'qwen-quota-146';
const SYNC_IMAGE_ONCE_SIZED_BY_POLICY = 'qwen-quota-101';

function withoutFields(key: string, ...fields: (keyof ProviderOffering)[]): ProviderOffering {
  const offering = getProviderOfferings()[key]!;
  return Object.fromEntries(
    Object.entries(offering).filter(([field]) => !fields.includes(field as keyof ProviderOffering)),
  ) as unknown as ProviderOffering;
}

afterEach(() => {
  catalogue.replacements.clear();
});

describe('an offering whose catalogue entry cannot be turned into a request', () => {
  it.each([
    ['a video without a clip length', SIZED_VIDEO, ['quotaVideoSeconds']],
    ['a video without a size or a resolution', SIZED_VIDEO, ['quotaVideoSize']],
    ['a video with a resolution but no ratio', TIERED_VIDEO, ['quotaVideoRatio']],
    ['an asynchronous image without a size', ASYNC_IMAGE, ['quotaImageSize']],
    ['a synchronous image without a size', SYNC_IMAGE, ['quotaImageSize']],
    [
      'the synchronous image that used to take its size from the caller',
      SYNC_IMAGE_ONCE_SIZED_BY_POLICY,
      ['quotaImageSize'],
    ],
  ] as const)('refuses %s before any provider request', async (_case, key, fields) => {
    catalogue.replacements.set(key, withoutFields(key, ...fields));
    const transport = vi.fn<(url: string, options: RequestInit) => Promise<Response>>();
    await expect(
      runQwenQuotaProbe(key, 'fixture-credential', callerPolicyHoldingASize, transport),
    ).rejects.toThrow('incomplete request in the catalogue');
    expect(transport).not.toHaveBeenCalled();
  });

  it('serves the same offerings once their catalogue entry is whole', async () => {
    const transport = vi
      .fn<(url: string, options: RequestInit) => Promise<Response>>()
      .mockImplementation(
        async () =>
          new Response(
            JSON.stringify({
              output: {
                task_id: 'fixture-task',
                task_status: 'SUCCEEDED',
                video_url: 'https://example.com/generated.mp4',
                results: [{ url: 'https://example.com/generated.png' }],
                choices: [
                  { message: { content: [{ image: 'https://example.com/generated.png' }] } },
                ],
              },
            }),
          ),
      );
    const whole = [
      SIZED_VIDEO,
      TIERED_VIDEO,
      ASYNC_IMAGE,
      SYNC_IMAGE,
      SYNC_IMAGE_ONCE_SIZED_BY_POLICY,
    ];
    for (const key of whole) {
      const result = await runQwenQuotaProbe(key, 'fixture-credential', policy, transport);
      expect(result.status).toBe('succeeded');
    }
    expect(transport).toHaveBeenCalledTimes(whole.length);
  });
});
