'use client';

import {
  buildLocalToByokHandoffDraft,
  type HandoffPreviewContextItem,
  type LocalToByokHandoffPreview,
} from '@agiworkforce/utils';
import {
  PROVIDER_DISPLAY,
  detectProviderFromModelId,
  formatPrivacyModeLabel,
  formatProviderModeLabel,
  getProviderSurface,
  providerSurfaceToProviderMode,
  type ProviderMode,
} from '@agiworkforce/types';
import { PROVIDER_LABELS, getModelMetadata, normalizeModelId } from '@shared/config/llm';
import type { Conversation, Message } from '@shared/stores/web-chat-store';

export const WEB_HANDOFF_CONTEXT_LIMIT = 10;
export const WEB_HANDOFF_PREVIEW_MAX_CHARS = 90_000;

const LOCAL_MODEL_PREFIXES = ['ollama/', 'ollama:', 'lmstudio/', 'lm-studio/', 'lmstudio:'];
const BYOK_MODEL_PREFIXES = ['open_router/', 'openrouter/', 'nvidia_nim/', 'nvidia/'];
const AUTO_MODE_IDS = new Set(['auto', 'auto-economy', 'auto-balanced', 'auto-premium']);

export interface WebHandoffContextCandidate extends HandoffPreviewContextItem {
  content: string;
  required?: boolean;
}

export interface WebLocalToByokPreview extends LocalToByokHandoffPreview {
  selectedContext: WebHandoffContextCandidate[];
}

export interface WebProviderModeInfo {
  providerMode: ProviderMode;
  label: string;
  privacyLabel: string;
}

function normalizeProviderKey(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
}

function inferProviderFromModelId(modelId: string | null | undefined): string | null {
  const canonicalModelId = normalizeModelId(modelId) ?? modelId;
  if (!canonicalModelId) return null;

  const metadata = getModelMetadata(canonicalModelId);
  if (metadata?.provider) return metadata.provider;

  const detected = detectProviderFromModelId(canonicalModelId);
  if (detected) return detected;

  const lower = canonicalModelId.toLowerCase();
  if (AUTO_MODE_IDS.has(lower)) return 'managed_cloud';
  if (LOCAL_MODEL_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
    return lower.startsWith('lm') ? 'lmstudio' : 'ollama';
  }
  if (BYOK_MODEL_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
    return lower.startsWith('nvidia') ? 'nvidia_nim' : 'open_router';
  }

  return null;
}

function providerModeFromProvider(provider: string | null): ProviderMode | null {
  if (!provider) return null;
  const normalizedProvider = normalizeProviderKey(provider);
  if (!normalizedProvider) return null;

  if (normalizedProvider === 'lmstudio' && PROVIDER_DISPLAY.lmstudio.isLocal) {
    return 'Local';
  }

  const surface = getProviderSurface(normalizedProvider);
  return providerSurfaceToProviderMode(surface);
}

export function getProviderModeForModel(modelId: string | null | undefined): ProviderMode | null {
  return providerModeFromProvider(inferProviderFromModelId(modelId));
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
  /**
   * Opens the consent ceremony. Called INSTEAD of `send` whenever an on-device
   * conversation is about to continue onto a direct BYOK provider.
   */
  startCeremony: (request: LocalToByokCeremonyRequest) => void;
  /** Performs the ordinary send. Never called on a Local → BYOK continuation. */
  send: () => void;
}

/**
 * The single decision point for "does this send cross the Local → BYOK trust
 * boundary?". It lives here rather than inline in WebChatPage so the branch is
 * directly testable: a test can pass spies for `startCeremony`/`send` and prove
 * that the outgoing content is NOT dispatched before consent.
 *
 * Locked critical rule (CLAUDE.md / AGENTS.md): "Local to BYOK must be an
 * explicit fork/continuation with context selection, secret scan, payload
 * preview, user consent, and visible provider label." Any early-return added
 * here that skips the ceremony while still calling `send` violates that rule —
 * refuse the send instead.
 */
export function routeLocalToByokSend(params: RouteLocalToByokSendParams): 'ceremony' | 'send' {
  const crossesBoundary = shouldForkLocalToByok({
    conversation: params.conversation,
    messages: params.messages,
    targetModelId: params.targetModelId,
  });

  // No source conversation means there is no prior on-device transcript to
  // carry across — `displayedMessages` is empty whenever `displayedConversationId`
  // is null — so there is nothing for the ceremony to disclose.
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

/**
 * The same trust boundary as `routeLocalToByokSend`, reached by the Regenerate
 * control, which resends an existing on-device transcript under the currently
 * selected model.
 *
 * This path REFUSES instead of opening the ceremony: the fork replays through
 * `sendContent`, which takes browser `File` attachments, whereas a regenerated
 * turn carries already-uploaded attachment records. Forking here would have to
 * drop them silently, so the honest outcome is a visible refusal that names the
 * boundary and points at the flow that does run the ceremony.
 *
 * Returns the message to show, or `null` when regenerating stays inside the
 * conversation's own trust boundary.
 */
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

/**
 * Concrete destination the consent ceremony must name — "visible provider
 * label" in the locked Local→BYOK rule. Labels come from the model registry
 * (`PROVIDER_LABELS`, derived from models.json), never from a hand-written map,
 * so a newly catalogued provider is named correctly without an edit here.
 * Returns undefined for a target the registry cannot name; the dialog then
 * falls back to the generic BYOK label rather than inventing a provider name.
 */
export function getByokTargetProviderLabel(modelId: string | null | undefined): string | undefined {
  const provider = inferProviderFromModelId(modelId);
  if (!provider) return undefined;
  return PROVIDER_LABELS[provider] ?? PROVIDER_LABELS[normalizeProviderKey(provider) ?? ''];
}

export function getProviderModeInfo(providerMode: ProviderMode): WebProviderModeInfo {
  return {
    providerMode,
    label: formatProviderModeLabel(providerMode),
    privacyLabel: formatPrivacyModeLabel(providerMode === 'Local' ? 'local' : 'byok'),
  };
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
