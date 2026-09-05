import { getModelPresentationLabel } from './modelInfo';

export const MODEL_ESCALATION_PREFIX = 'Moved to';

export interface ModelEscalationSource {
  movedFromModelId?: string | null;
  movedReason?: string | null;
  servedModelId?: string | null;
  conversationModelId?: string | null;
  routingSource?: 'manual' | 'auto' | null;
}

export interface ModelEscalation {
  movedFromModelId: string | null;
  servedModelId: string;
  reason: string | null;
  line: string;
}

/**
 * D-2026-09-05-06. Auto keeps a conversation on its model and only escalates on
 * a failure, so a turn served by a model other than the pinned one is that
 * escalation. The server marker is the first source; the derivation is the
 * fallback for turns persisted before the marker existed, and carries no reason.
 */
export function resolveModelEscalation(source: ModelEscalationSource): ModelEscalation | null {
  const served = source.servedModelId?.trim();
  if (!served) return null;

  const markedFrom = source.movedFromModelId?.trim();
  if (markedFrom && markedFrom !== served) {
    const reason = source.movedReason?.trim() ?? null;
    return {
      movedFromModelId: markedFrom,
      servedModelId: served,
      reason: reason && reason.length > 0 ? reason : null,
      line: formatEscalationLine(served, reason),
    };
  }

  const pinned = source.conversationModelId?.trim();
  if (source.routingSource === 'auto' && pinned && pinned !== served) {
    return {
      movedFromModelId: pinned,
      servedModelId: served,
      reason: null,
      line: formatEscalationLine(served, null),
    };
  }

  return null;
}

function formatEscalationLine(servedModelId: string, reason: string | null | undefined): string {
  const label = getModelPresentationLabel(servedModelId) || servedModelId;
  const trimmed = reason?.trim();
  return trimmed
    ? `${MODEL_ESCALATION_PREFIX} ${label}: ${trimmed}`
    : `${MODEL_ESCALATION_PREFIX} ${label}`;
}
