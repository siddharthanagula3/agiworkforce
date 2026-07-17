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
  const history = request.history ?? [];
  let classifier = classifyTaskLocally(request.message, history, request.attachments);

  // Conversation continuity: apply the SAME 5-turn sticky pivot + >50K
  // long-context guard the web server path applies in
  // `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts`, so an
  // Auto conversation routes to the same model on every surface. The inputs
  // mirror web exactly: `history` is PRIOR turns only (the outgoing turn is
  // `request.message`, never included in `history`), `cumulativeTokens` sums
  // the prior history plus the outgoing message, and `recentTaskTypes` counts
  // only prior USER turns. Empty history is a no-op (single-message routing).
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
