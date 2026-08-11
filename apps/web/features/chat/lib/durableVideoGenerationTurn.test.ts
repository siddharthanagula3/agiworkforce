import { describe, expect, it, vi } from 'vitest';
import {
  commitVideoTranscriptBeforeStart,
  startVideoAfterTranscriptCommit,
} from './durableVideoGenerationTurn';

describe('durable video transcript commit', () => {
  it('recovers committed-but-response-lost prompt and placeholder writes with the same callbacks', async () => {
    const events: string[] = [];
    const persistPrompt = vi
      .fn()
      .mockImplementationOnce(async () => {
        events.push('prompt-1');
        throw new Error('response lost');
      })
      .mockImplementationOnce(async () => {
        events.push('prompt-2');
      });
    const persistPlaceholder = vi
      .fn()
      .mockImplementationOnce(async () => {
        events.push('placeholder-1');
        throw new Error('response lost');
      })
      .mockImplementationOnce(async () => {
        events.push('placeholder-2');
      });

    await expect(
      commitVideoTranscriptBeforeStart({
        temporary: false,
        persistPrompt,
        persistPlaceholder,
      }),
    ).resolves.toEqual({ ok: true });
    expect(events).toEqual(['prompt-1', 'prompt-2', 'placeholder-1', 'placeholder-2']);
  });

  it('never reaches the assistant placeholder or provider-ready commit point when prompt persistence fails', async () => {
    const persistPlaceholder = vi.fn();
    const start = vi.fn();
    const result = await startVideoAfterTranscriptCommit({
      temporary: false,
      persistPrompt: vi.fn(async () => {
        throw new Error('database unavailable');
      }),
      persistPlaceholder,
      start,
    });

    expect(result).toMatchObject({ ok: false, phase: 'prompt' });
    expect(persistPlaceholder).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  it('crosses provider egress only after prompt and placeholder persistence', async () => {
    const events: string[] = [];

    await expect(
      startVideoAfterTranscriptCommit({
        temporary: false,
        persistPrompt: vi.fn(async () => {
          events.push('prompt-persisted');
        }),
        persistPlaceholder: vi.fn(async () => {
          events.push('placeholder-persisted');
        }),
        start: vi.fn(async () => {
          events.push('provider-post');
          return { taskId: '11111111-1111-4111-8111-111111111111' };
        }),
      }),
    ).resolves.toEqual({
      ok: true,
      started: { taskId: '11111111-1111-4111-8111-111111111111' },
    });
    expect(events).toEqual(['prompt-persisted', 'placeholder-persisted', 'provider-post']);
  });

  it('keeps temporary chat local without calling either persistence boundary', async () => {
    const persistPrompt = vi.fn();
    const persistPlaceholder = vi.fn();

    await expect(
      commitVideoTranscriptBeforeStart({
        temporary: true,
        persistPrompt,
        persistPlaceholder,
      }),
    ).resolves.toEqual({ ok: true });
    expect(persistPrompt).not.toHaveBeenCalled();
    expect(persistPlaceholder).not.toHaveBeenCalled();
  });
});
