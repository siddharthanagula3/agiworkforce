import { describe, expect, it } from 'vitest';
import { getProviderOfferings } from '@agiworkforce/types';
import { FREE_MODEL_HANDOFF_REASON_CODES } from '@/lib/chat-fallback-reason';
import { freeModelTurnNotes } from './free-model-turn-notes';

const offerings = Object.entries(getProviderOfferings());
const [freeModel, freeOffering] = offerings.find(
  ([, entry]) =>
    entry.provider === 'qwen' &&
    entry.quotaProbeProtocol === 'chat' &&
    entry.identityStatus === 'exact' &&
    !entry.quotaThinkingRequired,
)!;
const reasoningModel = offerings.find(
  ([, entry]) =>
    entry.provider === 'qwen' &&
    entry.quotaProbeProtocol === 'chat' &&
    entry.identityStatus === 'exact' &&
    entry.quotaThinkingRequired === true,
)?.[0];
const experientialModel = offerings.find(
  ([, entry]) => entry.provider === 'experientiallabs' && entry.quotaProbeProtocol === 'chat',
)![0];

const quiet = {
  modelId: freeModel,
  handoffReason: null,
  autoModelName: 'Fixture Auto',
  inProject: false,
  earlierAttachments: false,
  connectorsOn: false,
};

describe('what the composer says a free model will not use', () => {
  it('says nothing when nothing is switched on that the free model leaves out', () => {
    expect(freeModelTurnNotes(quiet)).toEqual([]);
  });

  it('says what of a project is sent, and does not deny the past-chat excerpts the Memory setting allows', () => {
    const [note] = freeModelTurnNotes({ ...quiet, inProject: true });

    expect(note).toEqual({
      id: 'project',
      text: "Free models can use this project's instructions and relevant file excerpts. Excerpts from its other chats are sent only when Search past chats is on in Settings, Memory.",
    });
    expect(note!.text).not.toMatch(/instructions only|other chats are not sent/);
  });

  it('says files and images on earlier messages are not read, and how to keep working with them', () => {
    expect(freeModelTurnNotes({ ...quiet, earlierAttachments: true })).toEqual([
      {
        id: 'attachments',
        text: 'Free models do not read the files or images on earlier messages in this chat. Attach one again with your message, or choose Fixture Auto to keep working with them.',
      },
    ]);
  });

  it('says connected apps that are switched on are not used', () => {
    expect(freeModelTurnNotes({ ...quiet, connectorsOn: true })).toEqual([
      {
        id: 'connectors',
        text: 'Free models do not use connected apps, so the ones switched on here are not used for this message.',
      },
    ]);
  });

  it('gives one line for each input, in a fixed order', () => {
    expect(
      freeModelTurnNotes({
        ...quiet,
        inProject: true,
        earlierAttachments: true,
        connectorsOn: true,
      }).map((note) => note.id),
    ).toEqual(['project', 'attachments', 'connectors']);
  });

  it('says a model that always reasons does so, and that the reasoning is not shown', () => {
    expect(reasoningModel).toBeDefined();
    expect(freeModelTurnNotes({ ...quiet, modelId: reasoningModel })).toEqual([
      {
        id: 'reasoning',
        text: 'This free model reasons before it answers. Its reasoning is not shown.',
      },
    ]);
  });

  it.each(FREE_MODEL_HANDOFF_REASON_CODES)(
    'for %s names who will answer and why, and drops lines that are untrue for that answer',
    (handoffReason) => {
      const notes = freeModelTurnNotes({
        ...quiet,
        handoffReason,
        inProject: true,
        earlierAttachments: true,
        connectorsOn: true,
      });

      expect(notes).toHaveLength(1);
      expect(notes[0]!.id).toBe('handoff');
      expect(notes[0]!.text).toMatch(/^Fixture Auto will answer this message because /);
      expect(notes[0]!.text.endsWith(`${freeOffering.displayName} stays selected.`)).toBe(true);
      // em-dash-allow: the character this assertion forbids in the composer line
      expect(notes[0]!.text).not.toContain('\u2014');
    },
  );

  it('says nothing for a model that is not a free quota chat model', () => {
    for (const modelId of ['auto', experientialModel, null]) {
      expect(
        freeModelTurnNotes({
          ...quiet,
          modelId,
          inProject: true,
          earlierAttachments: true,
          connectorsOn: true,
        }),
      ).toEqual([]);
    }
  });
});
