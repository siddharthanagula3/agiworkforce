import type { ProviderOffering } from '@agiworkforce/types';
import { getBestAutoModeForTier } from '@shared/config/llm';
import type { FreeModelHandoffReasonCode } from '@/lib/chat-fallback-reason';
import { isChatImageMimeType } from '@/lib/chat-attachment-policy';
import { freeQuotaSelection, isExperientialFreeOffering } from './free-quota-selection';

export type FreeModelAttachmentKind = 'image' | 'file';

export interface FreeModelTurnChoices {
  searchRequested?: boolean | undefined;
  research?: boolean | undefined;
  codeExecution?: boolean | undefined;
  officeCreation?: boolean | undefined;
  skillName?: string | null | undefined;
  mcpContext?: object | null | undefined;
  attachments?: readonly FreeModelAttachmentKind[] | undefined;
}

export interface FreeModelTurnRoute {
  model: string;
  requestedModel: string;
  handoffReason: FreeModelHandoffReasonCode | null;
}

export function freeQuotaChatOffering(modelId: string | null | undefined): ProviderOffering | null {
  const offering = freeQuotaSelection(modelId);
  if (!modelId || offering?.quotaProbeProtocol !== 'chat') return null;
  return isExperientialFreeOffering(modelId) ? null : offering;
}

export function freeModelAttachmentKind(attachment: {
  type?: string | undefined;
  mimeType?: string | undefined;
}): FreeModelAttachmentKind {
  const mimeType = attachment.mimeType ?? attachment.type ?? '';
  return attachment.type === 'image' || isChatImageMimeType(mimeType) ? 'image' : 'file';
}

export function freeModelHandoffReason(
  modelId: string | null | undefined,
  choices: FreeModelTurnChoices,
): FreeModelHandoffReasonCode | null {
  const offering = freeQuotaChatOffering(modelId);
  if (!offering) return null;
  if (choices.research) return 'free_model_research';
  if (choices.searchRequested) return 'free_model_web_search';
  if (choices.codeExecution) return 'free_model_code_execution';
  if (choices.officeCreation) return 'free_model_office_file';
  if (choices.skillName) return 'free_model_skill';
  if (choices.mcpContext) return 'free_model_connected_app';
  const attachments = choices.attachments ?? [];
  if (attachments.includes('file')) return 'free_model_file';
  if (attachments.includes('image') && offering.quotaChatImageInput !== true) {
    return 'free_model_image';
  }
  return null;
}

const REPLAYED_AS_SEARCH_REQUEST: FreeModelHandoffReasonCode = 'free_model_web_search';

// Regenerate and edit rebuild a send from saved replay options, which carry
// the search switch but not that a search was asked for outright. Without this
// a handed-over /search is replayed onto the free model as a plain question,
// with no search and no note.
export function freeModelHandoffReplay(
  userMetadata: { freeModelHandoff?: unknown } | null | undefined,
): { searchRequested?: true } {
  return userMetadata?.freeModelHandoff === REPLAYED_AS_SEARCH_REQUEST
    ? { searchRequested: true }
    : {};
}

export function routeFreeModelTurn(input: {
  model: string;
  planTier: string | null | undefined;
  choices: FreeModelTurnChoices;
}): FreeModelTurnRoute {
  const handoffReason = freeModelHandoffReason(input.model, input.choices);
  return {
    model: handoffReason ? getBestAutoModeForTier(input.planTier) : input.model,
    requestedModel: input.model,
    handoffReason,
  };
}
