import { FREE_TRIAL_GATEWAY } from './freeTrialClient';

export function chromeArtifactConversationUrl(conversationId: string): string {
  return `${FREE_TRIAL_GATEWAY}/chat/${encodeURIComponent(conversationId)}`;
}
