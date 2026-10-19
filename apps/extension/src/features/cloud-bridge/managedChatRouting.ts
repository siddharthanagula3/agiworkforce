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

export const ROUTING_TASK_TYPES: ReadonlySet<RoutingTaskType> = new Set([
  'coding',
  'reasoning',
  'general',
  'agentic',
  'multimodal',
  'research',
  'computer-use',
  'image_generation',
  'creative_writing',
  'long_context',
  'simple_chat',
]);

export const CHROME_MANAGED_RUNTIME_PROFILE = 'chrome/managed-chat';
export const CHROME_MANAGED_BROWSER_TASK_RUNTIME_PROFILE = 'chrome/managed-browser-task';

export function resolveChromeManagedChatRoute(
  request: ChromeManagedChatRoutingRequest,
): AutoRouteDecision {
  const classifier = classifyTaskLocally(request.text, request.history ?? [], request.attachments);

  return resolveAutoRoute({
    selection: request.selection,
    taskType: classifier.type,
    subscriptionTier: request.subscriptionTier,
    trustMode: 'managed_cloud',
    runtimeProfileId:
      classifier.type === 'computer-use'
        ? CHROME_MANAGED_BROWSER_TASK_RUNTIME_PROFILE
        : CHROME_MANAGED_RUNTIME_PROFILE,
    currentModelKey: request.currentModelKey,
    previousTaskType: request.previousTaskType,
    fallbackToAutoForCapabilityMismatch: true,
  });
}
