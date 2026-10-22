'use client';

import {
  buildLocalToByokHandoffDraft,
  type HandoffPreviewContextItem,
  type LocalToByokHandoffPreview,
} from '@agiworkforce/utils';
import { formatProviderModeLabel, type ProviderMode } from '@agiworkforce/types';
import { PROVIDER_LABELS } from '@shared/config/llm';
import {
  getProviderModeForModel,
  inferProviderFromModelId,
  normalizeProviderKey,
} from '@shared/lib/provider-mode-for-model';
import type { Conversation, Message } from '@shared/stores/web-chat-store';

export { getProviderModeForModel };

export const WEB_HANDOFF_CONTEXT_LIMIT = 10;
export const WEB_HANDOFF_PREVIEW_MAX_CHARS = 90_000;

export interface WebHandoffContextCandidate extends HandoffPreviewContextItem {
  content: string;
  required?: boolean;
}

export interface WebLocalToByokPreview extends LocalToByokHandoffPreview {
  selectedContext: WebHandoffContextCandidate[];
}

function getProviderModeFromMessage(message: Message): ProviderMode | null {
  const metadataProviderMode =
    typeof message.metadata?.providerMode === 'string'
      ? (message.metadata.providerMode as ProviderMode)
      : null;
  if (metadataProviderMode) return metadataProviderMode;
  return getProviderModeForModel(message.model);
}

export function getConversationProviderMode(
  conversation: Conversation | null | undefined,
  messages: readonly Message[],
): ProviderMode | null {
  const conversationMode = getProviderModeForModel(conversation?.model);
  if (conversationMode) return conversationMode;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const mode = getProviderModeFromMessage(messages[index]!);
    if (mode) return mode;
  }

  return null;
}

export function shouldForkLocalToByok(params: {
  conversation: Conversation | null | undefined;
  messages: readonly Message[];
  targetModelId: string;
}): boolean {
  const sourceMode = getConversationProviderMode(params.conversation, params.messages);
  const targetMode = getProviderModeForModel(params.targetModelId);
  return sourceMode === 'Local' && targetMode === 'DirectByok';
}

export interface LocalToByokCeremonyRequest {
  sourceConversationId: string;
  conversationTitle: string;
  candidates: WebHandoffContextCandidate[];
}

export interface RouteLocalToByokSendParams {
  sourceConversationId: string | null;
  conversation: Conversation | null | undefined;
  messages: readonly Message[];
  targetModelId: string;
  outgoingContent: string;
  startCeremony: (request: LocalToByokCeremonyRequest) => void;
  send: () => void;
}

export function routeLocalToByokSend(params: RouteLocalToByokSendParams): 'ceremony' | 'send' {
  const crossesBoundary = shouldForkLocalToByok({
    conversation: params.conversation,
    messages: params.messages,
    targetModelId: params.targetModelId,
  });

  if (!crossesBoundary || !params.sourceConversationId) {
    params.send();
    return 'send';
  }

  params.startCeremony({
    sourceConversationId: params.sourceConversationId,
    conversationTitle: params.conversation?.title?.trim() || 'Local conversation',
    candidates: buildHandoffContextCandidates({
      conversationId: params.sourceConversationId,
      messages: params.messages,
      outgoingContent: params.outgoingContent,
    }),
  });
  return 'ceremony';
}

export function resolveRegenerateBoundaryRefusal(params: {
  conversation: Conversation | null | undefined;
  messages: readonly Message[];
  targetModelId: string;
}): string | null {
  if (!shouldForkLocalToByok(params)) return null;

  const targetLabel = getByokTargetProviderLabel(params.targetModelId) ?? 'a BYOK provider';
  return (
    `This conversation ran on a local model. Regenerating with ${targetLabel} would send it off ` +
    'this device. Send the message again to review and approve a BYOK fork, or switch back to the ' +
    'local model to regenerate here.'
  );
}

export function getByokTargetProviderLabel(modelId: string | null | undefined): string | undefined {
  const provider = inferProviderFromModelId(modelId);
  if (!provider) return undefined;
  return PROVIDER_LABELS[provider] ?? PROVIDER_LABELS[normalizeProviderKey(provider) ?? ''];
}

function roleLabel(role: Message['role']): string {
  if (role === 'assistant') return 'Assistant reply';
  if (role === 'system') return 'System context';
  return 'User message';
}

export function buildHandoffContextCandidates(params: {
  conversationId: string;
  messages: readonly Message[];
  outgoingContent: string;
}): WebHandoffContextCandidate[] {
  const recentMessages = params.messages
    .filter((message) => message.content.trim().length > 0)
    .slice(-WEB_HANDOFF_CONTEXT_LIMIT);

  const messageContext = recentMessages.map((message, index): WebHandoffContextCandidate => {
    const label = `${roleLabel(message.role)} ${index + 1}`;
    return {
      id: `message-${message.id}`,
      kind: 'message',
      label,
      sourceUri: `web://conversation/${params.conversationId}/message/${message.id}`,
      content: message.content,
    };
  });

  const outgoing = params.outgoingContent.trim();
  if (!outgoing) return messageContext;

  return [
    ...messageContext,
    {
      id: 'outgoing-user-message',
      kind: 'message',
      label: 'Outgoing prompt',
      sourceUri: `web://conversation/${params.conversationId}/draft/outgoing-user-message`,
      content: outgoing,
      required: true,
    },
  ];
}

export async function buildWebLocalToByokPreview(params: {
  sourceConversationId: string;
  candidates: readonly WebHandoffContextCandidate[];
  selectedContextIds: readonly string[];
}): Promise<WebLocalToByokPreview> {
  const selected = params.candidates.filter((candidate) =>
    params.selectedContextIds.includes(candidate.id),
  );

  if (selected.length === 0) {
    throw new Error('Select at least one item before previewing the BYOK fork.');
  }

  const preview = await buildLocalToByokHandoffDraft({
    sourceSessionId: params.sourceConversationId,
    sourceSurface: 'web',
    targetSurface: 'web',
    selectedContext: selected,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });

  if (preview.redactedPayload.length > WEB_HANDOFF_PREVIEW_MAX_CHARS) {
    throw new Error('The redacted BYOK preview is too large. Deselect older context and retry.');
  }

  return { ...preview, selectedContext: selected };
}

export function buildAcceptedHandoffSystemMessage(preview: WebLocalToByokPreview): string {
  const localLabel = formatProviderModeLabel('Local');
  const byokLabel = formatProviderModeLabel('DirectByok');
  return [
    `${localLabel} to ${byokLabel} handoff accepted.`,
    'Only the redacted context below was approved for this BYOK continuation.',
    '',
    '```json',
    preview.redactedPayload,
    '```',
  ].join('\n');
}
