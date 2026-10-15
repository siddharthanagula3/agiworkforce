import { describe, expect, it } from 'vitest';
import { getProviderOfferings } from '@agiworkforce/types';
import { getBestAutoModeForTier } from '@shared/config/llm';
import {
  FREE_MODEL_HANDOFF_REASON_CODES,
  describeFallbackReason,
  fallbackStepLabel,
  handedOverTurnReason,
} from '@/lib/chat-fallback-reason';
import {
  freeModelAttachmentKind,
  freeModelHandoffReason,
  freeModelHandoffReplay,
  freeQuotaChatOffering,
  routeFreeModelTurn,
} from './free-model-handoff';
import { freeQuotaSelection } from './free-quota-selection';

const offerings = Object.entries(getProviderOfferings());
const textModel = offerings.find(
  ([, entry]) =>
    entry.provider === 'qwen' &&
    entry.quotaProbeProtocol === 'chat' &&
    entry.identityStatus === 'exact' &&
    entry.quotaChatImageInput !== true,
)![0];
const visionModel = offerings.find(
  ([, entry]) =>
    entry.provider === 'qwen' &&
    entry.quotaProbeProtocol === 'chat' &&
    entry.identityStatus === 'exact' &&
    entry.quotaChatImageInput === true,
)![0];
const imageGenerator = offerings.find(
  ([, entry]) => entry.provider === 'qwen' && entry.quotaProbeProtocol === 'image-sync',
)![0];
const experientialModel = offerings.find(
  ([, entry]) => entry.provider === 'experientiallabs' && entry.quotaProbeProtocol === 'chat',
)![0];
const FREE_AUTO = getBestAutoModeForTier('free');

describe('which model answers a message sent with a free model selected', () => {
  it('leaves a plain message with the free model, whatever its wording looks like', () => {
    for (const model of [textModel, visionModel]) {
      expect(routeFreeModelTurn({ model, planTier: 'free', choices: {} })).toEqual({
        model,
        requestedModel: model,
        handoffReason: null,
      });
    }
    expect(freeModelHandoffReason(textModel, { attachments: [] })).toBeNull();
  });

  it.each([
    ['research mode', { research: true }, 'free_model_research'],
    ['a requested web search', { searchRequested: true }, 'free_model_web_search'],
    ['Run code switched on', { codeExecution: true }, 'free_model_code_execution'],
    ['an Office file', { officeCreation: true }, 'free_model_office_file'],
    ['a skill', { skillName: 'fixture-skill' }, 'free_model_skill'],
    ['a connected app prompt', { mcpContext: { prompt: {} } }, 'free_model_connected_app'],
    ['a document', { attachments: ['file'] as const }, 'free_model_file'],
    ['a document beside an image', { attachments: ['image', 'file'] as const }, 'free_model_file'],
    ['an image', { attachments: ['image'] as const }, 'free_model_image'],
  ] as const)(
    'hands a message with %s to the account’s Auto model and keeps the pick as the requested model',
    (_label, choices, reason) => {
      expect(routeFreeModelTurn({ model: textModel, planTier: 'free', choices })).toEqual({
        model: FREE_AUTO,
        requestedModel: textModel,
        handoffReason: reason,
      });
    },
  );

  it('lets a free model that reads images keep an image, and hands over only what it cannot read', () => {
    expect(freeModelHandoffReason(visionModel, { attachments: ['image', 'image'] })).toBeNull();
    expect(freeModelHandoffReason(visionModel, { attachments: ['image', 'file'] })).toBe(
      'free_model_file',
    );
  });

  it('names the mode before a tool, and a tool before an attachment, when several apply', () => {
    expect(
      freeModelHandoffReason(textModel, {
        research: true,
        searchRequested: true,
        codeExecution: true,
        attachments: ['file'],
      }),
    ).toBe('free_model_research');
    expect(freeModelHandoffReason(textModel, { codeExecution: true, attachments: ['file'] })).toBe(
      'free_model_code_execution',
    );
  });

  it('uses the Auto model of the plan the account is on', () => {
    expect(
      routeFreeModelTurn({ model: textModel, planTier: 'pro', choices: { research: true } }).model,
    ).toBe(getBestAutoModeForTier('pro'));
    expect(
      routeFreeModelTurn({ model: textModel, planTier: undefined, choices: { research: true } })
        .model,
    ).toBe(FREE_AUTO);
  });

  it('never moves a turn that was not sent to a free quota chat model', () => {
    const everything = {
      research: true,
      searchRequested: true,
      codeExecution: true,
      officeCreation: true,
      skillName: 'fixture-skill',
      mcpContext: {},
      attachments: ['file', 'image'] as const,
    };
    for (const model of [FREE_AUTO, 'auto', imageGenerator, experientialModel]) {
      expect(routeFreeModelTurn({ model, planTier: 'free', choices: everything })).toEqual({
        model,
        requestedModel: model,
        handoffReason: null,
      });
    }
    expect(freeQuotaChatOffering(experientialModel)).toBeNull();
    expect(freeQuotaChatOffering(imageGenerator)).toBeNull();
    expect(freeQuotaChatOffering(textModel)).toBe(freeQuotaSelection(textModel));
  });

  it('reads an attachment by its media type, whichever shape names it', () => {
    expect(freeModelAttachmentKind({ type: 'image', mimeType: 'image/png' })).toBe('image');
    expect(freeModelAttachmentKind({ type: 'file', mimeType: 'application/pdf' })).toBe('file');
    expect(freeModelAttachmentKind({ type: 'image/webp' })).toBe('image');
    expect(freeModelAttachmentKind({ type: 'text/csv' })).toBe('file');
    expect(freeModelAttachmentKind({})).toBe('file');
  });
});

describe('replaying a message that was handed over', () => {
  it('asks for the search again when the message was a requested search', () => {
    expect(freeModelHandoffReplay({ freeModelHandoff: 'free_model_web_search' })).toEqual({
      searchRequested: true,
    });
  });

  it('adds nothing for a choice the saved replay options already carry, or for a message that was not handed over', () => {
    for (const reason of FREE_MODEL_HANDOFF_REASON_CODES) {
      if (reason === 'free_model_web_search') continue;
      expect(freeModelHandoffReplay({ freeModelHandoff: reason }), reason).toEqual({});
    }
    expect(freeModelHandoffReplay({})).toEqual({});
    expect(freeModelHandoffReplay(undefined)).toEqual({});
    expect(freeModelHandoffReplay({ freeModelHandoff: 'something-else' })).toEqual({});
  });
});

describe('the note a handed-over reply keeps', () => {
  it.each(FREE_MODEL_HANDOFF_REASON_CODES)(
    '%s names what answered and why, and says what happened then rather than what is selected now',
    (reason) => {
      const note = describeFallbackReason(reason, 'Fixture Auto')!;

      expect(note).toContain('so Fixture Auto answered this message.');
      expect(note).toMatch(/the free model you picked/i);
      expect(note.endsWith("The conversation's model was not changed.")).toBe(true);
      expect(note).not.toMatch(/is still selected|stays selected/);
      // em-dash-allow: the character this assertion forbids in the saved note
      expect(note).not.toContain('\u2014');
      expect(describeFallbackReason(reason)).toContain('so Auto answered this message.');
      expect(fallbackStepLabel(reason, 'Fixture Auto')).toBe(
        'Handed to Fixture Auto for this message',
      );
      expect(fallbackStepLabel(reason, null)).toBe('Handed to Auto for this message');
    },
  );

  it('keeps the server reason that the request was not carried out, and otherwise the hand-over', () => {
    expect(handedOverTurnReason('free_model_research', 'research_unsupported_model')).toBe(
      'research_unsupported_model',
    );
    expect(handedOverTurnReason('free_model_research', 'managed_failover')).toBe(
      'free_model_research',
    );
    expect(handedOverTurnReason('free_model_web_search', undefined)).toBe('free_model_web_search');
    expect(handedOverTurnReason(undefined, 'managed_failover')).toBe('managed_failover');
    expect(handedOverTurnReason(undefined, undefined)).toBeUndefined();
  });

  it('gives every reason its own sentence', () => {
    const notes = FREE_MODEL_HANDOFF_REASON_CODES.map((reason) => describeFallbackReason(reason));

    expect(new Set(notes).size).toBe(FREE_MODEL_HANDOFF_REASON_CODES.length);
  });
});
