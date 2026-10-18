import { getModelMetadataById } from '@agiworkforce/types';

import type { SidePanelChatMessage } from './chat-state';

export interface ResolvedRoute {
  model: string;
  provider: string;
  autoRouteReason?: string;
  movedFromModel?: string;
}

export interface AnsweredRouting {
  modelKey: string;
  reason: string;
  answeredModel?: string;
}

export function resolvedRouteFrom(
  routing: AnsweredRouting,
  previousAnswerModel: () => string | undefined,
): ResolvedRoute | null {
  const metadata =
    (routing.answeredModel ? getModelMetadataById(routing.answeredModel) : null) ??
    getModelMetadataById(routing.modelKey);
  if (!metadata) return null;
  const chosenByAuto = routing.reason !== 'explicit';
  const movedFrom = chosenByAuto ? previousAnswerModel() : undefined;
  return {
    model: metadata.id,
    provider: metadata.provider,
    ...(chosenByAuto ? { autoRouteReason: routing.reason } : {}),
    ...(movedFrom && movedFrom !== metadata.id ? { movedFromModel: movedFrom } : {}),
  };
}

export function applyResolvedRoute(message: SidePanelChatMessage, route: ResolvedRoute): void {
  message.model = route.model;
  message.provider = route.provider;
  if (route.autoRouteReason) message.autoRouteReason = route.autoRouteReason;
  else delete message.autoRouteReason;
  if (route.movedFromModel) message.movedFromModel = route.movedFromModel;
  else delete message.movedFromModel;
}
