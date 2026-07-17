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

/**
 * Chrome's pure adapter into the canonical Managed Cloud router.
 *
 * This function cannot admit Local or BYOK routes: the generated
 * `chrome/managed-chat` runtime profile owns the trust and harness boundary.
 * Browser-action mechanics use the separate `chrome/browser-task` profile and
 * are never an inference fallback.
 */
export function resolveChromeManagedChatRoute(
  request: ChromeManagedChatRoutingRequest,
): AutoRouteDecision {
  const classifier = classifyTaskLocally(request.text, request.history ?? [], request.attachments);

  return resolveAutoRoute({
    selection: request.selection,
    taskType: classifier.type,
    subscriptionTier: request.subscriptionTier,
    trustMode: 'managed_cloud',
    runtimeProfileId: 'chrome/managed-chat',
    currentModelKey: request.currentModelKey,
    previousTaskType: request.previousTaskType,
    fallbackToAutoForCapabilityMismatch: true,
  });
}
