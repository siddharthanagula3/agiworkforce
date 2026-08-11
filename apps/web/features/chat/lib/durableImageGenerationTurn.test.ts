import { describe, expect, it, vi } from 'vitest';
import { runDurableImageGenerationTurn } from './durableImageGenerationTurn';

describe('runDurableImageGenerationTurn', () => {
  it('commits the user turn before crossing the paid provider boundary', async () => {
    const events: string[] = [];

    const outcome = await runDurableImageGenerationTurn({
      mode: 'new',
      temporary: false,
      persistPrompt: vi.fn(async () => {
        events.push('prompt-saved');
      }),
      beforeGenerate: vi.fn(() => {
        events.push('placeholder-added');
      }),
      generate: vi.fn(async () => {
        events.push('provider-called');
        return '/api/files/image-fixture';
      }),
      onGenerated: vi.fn(() => {
        events.push('image-presented');
      }),
      persistResult: vi.fn(async () => {
        events.push('result-saved');
      }),
    });

    expect(outcome).toEqual({ status: 'completed', imageUrl: '/api/files/image-fixture' });
    expect(events).toEqual([
      'prompt-saved',
      'placeholder-added',
      'provider-called',
      'image-presented',
      'result-saved',
    ]);
  });

  it('does not call the provider or create an assistant placeholder when the prompt save fails', async () => {
    const generate = vi.fn(async () => '/api/files/should-not-exist');
    const beforeGenerate = vi.fn();
    const persistResult = vi.fn();
    const saveError = new Error('intercepted message save failure');

    const outcome = await runDurableImageGenerationTurn({
      mode: 'new',
      temporary: false,
      persistPrompt: vi.fn().mockRejectedValue(saveError),
      beforeGenerate,
      generate,
      onGenerated: vi.fn(),
      persistResult,
    });

    expect(outcome).toEqual({ status: 'prompt-persistence-failed', error: saveError });
    expect(beforeGenerate).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect(persistResult).not.toHaveBeenCalled();
  });

  it('returns the already-created asset when assistant persistence fails', async () => {
    const generatedAsset = '/api/files/durable-image-fixture';
    const saveError = new Error('intercepted assistant save failure');
    const generate = vi.fn().mockResolvedValue(generatedAsset);

    const outcome = await runDurableImageGenerationTurn({
      mode: 'new',
      temporary: false,
      persistPrompt: vi.fn().mockResolvedValue(undefined),
      beforeGenerate: vi.fn(),
      generate,
      onGenerated: vi.fn(),
      persistResult: vi.fn().mockRejectedValue(saveError),
    });

    expect(outcome).toEqual({
      status: 'result-persistence-failed',
      imageUrl: generatedAsset,
      error: saveError,
    });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('awaits regeneration persistence and preserves its asset on failure', async () => {
    let releaseSave: (() => void) | undefined;
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    const persistResult = vi.fn(() =>
      saveGate.then(() => Promise.reject(new Error('save failed'))),
    );

    let settled = false;
    const run = runDurableImageGenerationTurn({
      mode: 'regenerate',
      temporary: false,
      beforeGenerate: vi.fn(),
      generate: vi.fn().mockResolvedValue('/api/files/regenerated-image-fixture'),
      onGenerated: vi.fn(),
      persistResult,
    }).then((outcome) => {
      settled = true;
      return outcome;
    });

    await Promise.resolve();
    expect(settled).toBe(false);
    releaseSave?.();

    await expect(run).resolves.toMatchObject({
      status: 'result-persistence-failed',
      imageUrl: '/api/files/regenerated-image-fixture',
    });
    expect(persistResult).toHaveBeenCalledTimes(1);
  });

  it('intentionally skips both transcript writes for a temporary chat', async () => {
    const persistPrompt = vi.fn();
    const persistResult = vi.fn();
    const generate = vi.fn().mockResolvedValue('blob:temporary-image-fixture');

    await expect(
      runDurableImageGenerationTurn({
        mode: 'new',
        temporary: true,
        persistPrompt,
        beforeGenerate: vi.fn(),
        generate,
        onGenerated: vi.fn(),
        persistResult,
      }),
    ).resolves.toEqual({ status: 'completed', imageUrl: 'blob:temporary-image-fixture' });

    expect(persistPrompt).not.toHaveBeenCalled();
    expect(persistResult).not.toHaveBeenCalled();
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
