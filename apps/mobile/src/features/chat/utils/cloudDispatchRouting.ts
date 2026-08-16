import {
  applyConversationContext,
  classifyTaskLocally,
  estimateTokens,
  resolveAutoRoute,
  type RoutingAttachment,
  type RoutingMessage,
  type SelectedAutoRoute,
  type UnavailableAutoRoute,
} from '@agiworkforce/routing';
import {
  canAccessCloudModelForTier,
  isCloudManagedModelId,
} from '@/src/features/model-picker/service';

export interface MobileCloudDispatchRequest {
  selection: string;
  message: string;
  subscriptionTier?: string | null;
  history?: ReadonlyArray<RoutingMessage>;
  attachments?: ReadonlyArray<RoutingAttachment>;
  currentModelKey?: string | null;
}

export type MobileCloudDispatchDecision =
  | (SelectedAutoRoute & { dispatch: 'chat' | 'media' })
  | UnavailableAutoRoute;

export function resolveMobileCloudDispatch(
  request: MobileCloudDispatchRequest,
): MobileCloudDispatchDecision {
  const history = request.history ?? [];
  let classifier = classifyTaskLocally(request.message, history, request.attachments);

  if (
    isCloudManagedModelId(request.selection) &&
    !canAccessCloudModelForTier(request.selection, request.subscriptionTier ?? 'free')
  ) {
    return {
      status: 'unavailable',
      code: 'explicit_model_ineligible',
      requestedSelection: request.selection,
      requestedProfile: null,
      effectiveProfile: null,
      taskType: classifier.type,
      reasons: ['The selected model is not available on the current plan.'],
    };
  }

  if (history.length > 0) {
    const cumulativeTokens = history.reduce(
      (sum, message) => sum + estimateTokens(message.content),
      estimateTokens(request.message),
    );
    const recentTaskTypes = history
      .filter((message) => message.role === 'user')
      .map((message) => classifyTaskLocally(message.content, []).type);
    classifier = applyConversationContext(classifier, {
      cumulativeTokens,
      recentTaskTypes,
    });
  }

  const route = resolveAutoRoute({
    selection: request.selection,
    taskType: classifier.type,
    subscriptionTier: request.subscriptionTier,
    trustMode: 'managed_cloud',
    runtimeProfileId: 'mobile/cloud-chat',
    currentModelKey: request.currentModelKey,
    fallbackToAutoForCapabilityMismatch: true,
  });

  if (route.status === 'unavailable') return route;
  return {
    ...route,
    dispatch: route.harnessId.endsWith('/media') ? 'media' : 'chat',
  };
}
