import { describe, expect, it, vi } from 'vitest';
import { getRoutingSlotModel } from '@agiworkforce/types';

import {
  rewriteCloudVoiceTranscript,
  type CloudVoiceRewriteDependencies,
} from '../cloudVoiceService';

function dependencies(
  content: string,
): CloudVoiceRewriteDependencies & { invoke: ReturnType<typeof vi.fn> } {
  return {
    assertBoundary: vi.fn(),
    invoke: vi.fn().mockResolvedValue({ content }),
  };
}

describe('rewriteCloudVoiceTranscript', () => {
  it('uses the managed voice-rewrite slot and returns an approved action candidate', async () => {
    const deps = dependencies(
      JSON.stringify({
        mode: 'action',
        text: 'Open Notes and create a checklist for the launch.',
      }),
    );

    const result = await rewriteCloudVoiceTranscript(
      'um open notes and, like, make a checklist for the launch',
      deps,
    );

    expect(result).toEqual({
      kind: 'action',
      text: 'Open Notes and create a checklist for the launch.',
    });
    expect(deps.assertBoundary).toHaveBeenCalledTimes(2);
    expect(deps.invoke).toHaveBeenCalledWith('llm_send_message', {
      request: expect.objectContaining({
        model: getRoutingSlotModel('voice_rewrite'),
        provider: 'managed_cloud',
        prefer_cloud_credits: true,
        trust_mode: 'managed',
      }),
    });
  });

  it('returns polished dictation without treating ordinary questions as desktop actions', async () => {
    const deps = dependencies(
      '```json\n{"mode":"dictation","text":"What should we prioritize this week?"}\n```',
    );

    await expect(
      rewriteCloudVoiceTranscript('what should we prioritize this week', deps),
    ).resolves.toEqual({
      kind: 'dictation',
      text: 'What should we prioritize this week?',
    });
  });

  it('fails safely to local cleanup and dictation when the managed rewrite is malformed', async () => {
    const deps = dependencies('I ignored the requested schema');

    await expect(
      rewriteCloudVoiceTranscript('um do not delete, like, the launch notes', deps),
    ).resolves.toEqual({
      kind: 'dictation',
      text: 'do not delete, the launch notes',
    });
  });

  it('rejects the result when the authenticated Cloud boundary changes', async () => {
    const deps = dependencies('{"mode":"dictation","text":"Keep this private."}');
    vi.mocked(deps.assertBoundary)
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error('Cloud account changed');
      });

    await expect(rewriteCloudVoiceTranscript('keep this private', deps)).rejects.toThrow(
      'Cloud account changed',
    );
  });
});
