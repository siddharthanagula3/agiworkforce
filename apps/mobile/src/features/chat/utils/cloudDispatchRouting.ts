import {
  classifyTaskLocally,
  resolveAutoRoute,
  type RoutingAttachment,
  type RoutingMessage,
  type SelectedAutoRoute,
  type UnavailableAutoRoute,
} from '@agiworkforce/routing';

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

/**
 * Mobile's pure adapter into the canonical Managed Cloud router.
 *
 * The registry/runtime profile remains authoritative for trust, lifecycle,
 * tier, capability, and harness admission. In particular, a text selection
 * may fall back to Auto only when the classified task requires an intrinsic
 * specialist capability such as image output; this cannot cross out of the
 * `mobile/cloud-chat` Managed Cloud boundary.
 */
export function resolveMobileCloudDispatch(
  request: MobileCloudDispatchRequest,
): MobileCloudDispatchDecision {
  const classifier = classifyTaskLocally(
    request.message,
    request.history ?? [],
    request.attachments,
  );
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
