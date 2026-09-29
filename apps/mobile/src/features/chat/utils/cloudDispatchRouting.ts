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
  preferSlots?: readonly string[];
}

export type MobileCloudDispatchDecision =
  (SelectedAutoRoute & { dispatch: 'chat' | 'media' }) | UnavailableAutoRoute;

export function cloudDispatchUnavailableMessage(route: UnavailableAutoRoute): string {
  switch (route.code) {
    case 'explicit_model_ineligible':
    case 'explicit_route_ineligible':
      return 'This model is not available for this request or plan. Choose another AGI Cloud model to continue.';
    case 'mandatory_capability_unavailable':
      return 'No available AGI Cloud model supports this request. Try a different model or remove the attachment.';
    case 'unknown_selection':
      return 'This model selection is no longer available. Choose a model again to continue.';
    case 'trust_mode_not_permitted':
      return 'This request cannot run in AGI Cloud. Check the chat mode before trying again.';
    case 'unknown_task':
      return 'AGI Cloud could not route this request. Rephrase it or choose another model.';
    case 'unknown_runtime_profile':
    case 'runtime_profile_unavailable':
    case 'runtime_profile_mismatch':
    case 'no_eligible_route':
      return 'No AGI Cloud model is available right now. Try again shortly or choose another model.';
  }
}

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
    ...(request.preferSlots && request.preferSlots.length > 0
      ? { preferSlots: request.preferSlots }
      : {}),
  });

  if (route.status === 'unavailable') return route;
  return {
    ...route,
    dispatch: route.harnessId.endsWith('/media') ? 'media' : 'chat',
  };
}
