import { describe, expect, it, vi } from 'vitest';
import {
  buildAcceptedHandoffSystemMessage,
  buildHandoffContextCandidates,
  getByokTargetProviderLabel,
  getConversationProviderMode,
  getProviderModeForModel,
  resolveRegenerateBoundaryRefusal,
  routeLocalToByokSend,
  shouldForkLocalToByok,
  type WebLocalToByokPreview,
} from './localByokHandoff';
import type { Conversation, Message } from '@shared/stores/web-chat-store';
import { getProviderConfig, getProviderSurface, PROVIDERS_IN_ORDER } from '@agiworkforce/types';

function requireDirectByokFixture(): { modelId: string; providerLabel: string } {
  for (const provider of PROVIDERS_IN_ORDER) {
    if (getProviderSurface(provider) !== 'byok') continue;
    const providerLabel = getProviderConfig(provider)?.label;
    if (providerLabel) return { modelId: `${provider}/fixture-byok-model`, providerLabel };
  }
  throw new Error('Canonical model registry is missing a direct-BYOK provider fixture');
}

const LOCAL_MODEL_ID = 'ollama/fixture-local-model';
const LM_STUDIO_MODEL_ID = 'lmstudio/fixture-local-model';
const LM_STUDIO_COMPAT_MODEL_ID = 'lm-studio/fixture-local-model';
const BYOK_FIXTURE = requireDirectByokFixture();
const BYOK_MODEL_ID = BYOK_FIXTURE.modelId;

const conversation: Conversation = {
  id: 'conv-local',
  title: 'Local thread',
  createdAt: '2026-05-21T00:00:00.000Z',
  updatedAt: '2026-05-21T00:00:00.000Z',
  model: LOCAL_MODEL_ID,
};

const messages: Message[] = [
  {
    id: 'msg-1',
    role: 'user',
    content: 'Local context',
    createdAt: '2026-05-21T00:00:01.000Z',
    model: LOCAL_MODEL_ID,
  },
];

describe('localByokHandoff', () => {
  it('classifies local and direct BYOK provider modes from model ids', () => {
    expect(getProviderModeForModel(LOCAL_MODEL_ID)).toBe('Local');
    expect(getProviderModeForModel(BYOK_MODEL_ID)).toBe('DirectByok');
  });

  it('classifies LM Studio as Local from the registry, with no per-provider special case', () => {
    // LM Studio used to be pinned Local by a hardcoded PROVIDER_DISPLAY check that
    // short-circuited the registry lookup. The mode now comes from the provider's
    // `trustModes: ['local']` harness; drop that harness and this goes null, which
    // is exactly what would silently disable the fork ceremony below.
    expect(getProviderModeForModel(LM_STUDIO_MODEL_ID)).toBe('Local');
    expect(getProviderModeForModel(LM_STUDIO_COMPAT_MODEL_ID)).toBe('Local');
    expect(
      shouldForkLocalToByok({
        conversation: { ...conversation, model: LM_STUDIO_MODEL_ID },
        messages: [{ ...messages[0]!, model: LM_STUDIO_MODEL_ID }],
        targetModelId: BYOK_MODEL_ID,
      }),
    ).toBe(true);
  });

  it('detects only Local to Direct BYOK as a required fork', () => {
    expect(
      shouldForkLocalToByok({
        conversation,
        messages,
        targetModelId: BYOK_MODEL_ID,
      }),
    ).toBe(true);
    expect(
      shouldForkLocalToByok({
        conversation,
        messages,
        targetModelId: 'auto-balanced',
      }),
    ).toBe(false);
  });

  it('falls back to message metadata when conversation model is absent', () => {
    expect(
      getConversationProviderMode(null, [
        {
          ...messages[0]!,
          model: undefined,
          metadata: { providerMode: 'Local' },
        },
      ]),
    ).toBe('Local');
  });

  it('builds recent message context with required outgoing prompt', () => {
    const candidates = buildHandoffContextCandidates({
      conversationId: conversation.id,
      messages,
      outgoingContent: 'Continue with BYOK',
    });

    expect(candidates.map((candidate) => candidate.id)).toEqual([
      'message-msg-1',
      'outgoing-user-message',
    ]);
    expect(candidates.at(-1)?.required).toBe(true);
  });

  it('names the concrete destination provider from the model registry', () => {
    expect(getByokTargetProviderLabel(BYOK_MODEL_ID)).toBe(BYOK_FIXTURE.providerLabel);
    expect(getByokTargetProviderLabel('')).toBeUndefined();
  });

  it('creates an accepted handoff system message with the redacted payload', () => {
    const systemMessage = buildAcceptedHandoffSystemMessage({
      redactedPayload: '{"selectedContext":[]}',
    } as WebLocalToByokPreview);

    expect(systemMessage).toContain('handoff accepted');
    expect(systemMessage).toContain('"selectedContext"');
  });
});

// SIX-01 regression. `routeLocalToByokSend` is the exact branch WebChatPage's
// `handleSend` runs, so these assertions are about the shipped send path, not a
// re-implementation of it. The defect being locked out: a `const
// webLocalToByokHandoffEnabled = false;` literal that skipped the ceremony and
// dropped straight through to `sendContent`, sending an on-device transcript to
// a BYOK provider with no context selection, secret scan, payload preview,
// consent or provider label.
describe('routeLocalToByokSend', () => {
  const byokModel = BYOK_MODEL_ID;

  it('opens the consent ceremony instead of sending when a Local chat continues onto BYOK', () => {
    const startCeremony = vi.fn();
    const send = vi.fn();

    const decision = routeLocalToByokSend({
      sourceConversationId: conversation.id,
      conversation,
      messages,
      targetModelId: byokModel,
      outgoingContent: 'Continue with BYOK',
      startCeremony,
      send,
    });

    expect(decision).toBe('ceremony');
    // The load-bearing assertion: nothing is dispatched before consent.
    expect(send).not.toHaveBeenCalled();
    expect(startCeremony).toHaveBeenCalledTimes(1);

    const request = startCeremony.mock.calls[0]![0];
    expect(request.sourceConversationId).toBe(conversation.id);
    expect(request.conversationTitle).toBe('Local thread');
    // Every prior on-device message plus the outgoing prompt is offered for
    // review — the user cannot consent to context they were never shown.
    expect(request.candidates.map((candidate: { id: string }) => candidate.id)).toEqual([
      'message-msg-1',
      'outgoing-user-message',
    ]);
  });

  it('sends directly when the target does not cross the Local boundary', () => {
    const startCeremony = vi.fn();
    const send = vi.fn();

    const decision = routeLocalToByokSend({
      sourceConversationId: conversation.id,
      conversation,
      messages,
      targetModelId: 'auto-balanced',
      outgoingContent: 'Stay local',
      startCeremony,
      send,
    });

    expect(decision).toBe('send');
    expect(send).toHaveBeenCalledTimes(1);
    expect(startCeremony).not.toHaveBeenCalled();
  });

  it('sends directly when a BYOK-started chat continues on BYOK', () => {
    const startCeremony = vi.fn();
    const send = vi.fn();

    const decision = routeLocalToByokSend({
      sourceConversationId: 'conv-byok',
      conversation: { ...conversation, id: 'conv-byok', model: byokModel },
      messages: [{ ...messages[0]!, model: byokModel }],
      targetModelId: byokModel,
      outgoingContent: 'Keep going',
      startCeremony,
      send,
    });

    expect(decision).toBe('send');
    expect(send).toHaveBeenCalledTimes(1);
    expect(startCeremony).not.toHaveBeenCalled();
  });

  it('sends directly on a brand-new chat, which carries no on-device transcript', () => {
    const startCeremony = vi.fn();
    const send = vi.fn();

    const decision = routeLocalToByokSend({
      sourceConversationId: null,
      conversation: null,
      messages: [],
      targetModelId: byokModel,
      outgoingContent: 'First message',
      startCeremony,
      send,
    });

    expect(decision).toBe('send');
    expect(send).toHaveBeenCalledTimes(1);
    expect(startCeremony).not.toHaveBeenCalled();
  });

  it('still requires the ceremony when the Local provider is only recorded on the messages', () => {
    const startCeremony = vi.fn();
    const send = vi.fn();

    const decision = routeLocalToByokSend({
      sourceConversationId: 'conv-untitled',
      conversation: { ...conversation, id: 'conv-untitled', model: undefined, title: '' },
      messages: [{ ...messages[0]!, model: undefined, metadata: { providerMode: 'Local' } }],
      targetModelId: byokModel,
      outgoingContent: 'Continue with BYOK',
      startCeremony,
      send,
    });

    expect(decision).toBe('ceremony');
    expect(send).not.toHaveBeenCalled();
    expect(startCeremony.mock.calls[0]![0].conversationTitle).toBe('Local conversation');
  });
});

// The Regenerate control reaches the same boundary by a different route: it
// resends the whole on-device transcript under the CURRENTLY selected model.
describe('resolveRegenerateBoundaryRefusal', () => {
  it('refuses, naming the destination provider, when regenerating a Local chat on BYOK', () => {
    const refusal = resolveRegenerateBoundaryRefusal({
      conversation,
      messages,
      targetModelId: BYOK_MODEL_ID,
    });

    expect(refusal).toBeTypeOf('string');
    expect(refusal).toContain(BYOK_FIXTURE.providerLabel);
    expect(refusal).toContain('local model');
    // Points at the flow that DOES run the ceremony rather than dead-ending.
    expect(refusal).toContain('BYOK fork');
  });

  it('allows regeneration that stays inside the conversation trust boundary', () => {
    expect(
      resolveRegenerateBoundaryRefusal({
        conversation,
        messages,
        targetModelId: LOCAL_MODEL_ID,
      }),
    ).toBeNull();
    expect(
      resolveRegenerateBoundaryRefusal({
        conversation: { ...conversation, model: BYOK_MODEL_ID },
        messages: [{ ...messages[0]!, model: BYOK_MODEL_ID }],
        targetModelId: BYOK_MODEL_ID,
      }),
    ).toBeNull();
  });
});
