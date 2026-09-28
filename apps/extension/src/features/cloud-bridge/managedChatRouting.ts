import {
  classifyTaskLocally,
  resolveAutoRoute,
  type AutoRouteDecision,
  type RoutingAttachment,
  type RoutingMessage,
  type RoutingTaskType,
} from '@agiworkforce/routing';

export interface ChromeManagedChatRoutingRequest {
  selection: string;
  text: string;
  subscriptionTier?: string | null;
  history?: ReadonlyArray<RoutingMessage>;
  attachments?: ReadonlyArray<RoutingAttachment>;
  currentModelKey?: string | null;
  previousTaskType?: RoutingTaskType | null;
}

export const CHROME_MANAGED_RUNTIME_PROFILE = 'chrome/managed-chat';

export function resolveChromeManagedChatRoute(
  request: ChromeManagedChatRoutingRequest,
): AutoRouteDecision {
  const classifier = classifyTaskLocally(request.text, request.history ?? [], request.attachments);

  return resolveAutoRoute({
    selection: request.selection,
    taskType: classifier.type,
    subscriptionTier: request.subscriptionTier,
    trustMode: 'managed_cloud',
    runtimeProfileId: CHROME_MANAGED_RUNTIME_PROFILE,
    currentModelKey: request.currentModelKey,
    previousTaskType: request.previousTaskType,
    fallbackToAutoForCapabilityMismatch: true,
  });
}
