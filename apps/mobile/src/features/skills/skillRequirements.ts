import {
  CHAT_CODE_RUN_TOOL_NAME,
  MANAGED_OFFICE_FILE_TOOL_NAME,
} from '@agiworkforce/cloud-contracts';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { useTierStore } from '@/src/features/billing/store';
import { NEW_CHAT_STYLE_KEY, useChatViewStore } from '@/stores/chat/chatViewStore';
import type { ManagedSkillSummary } from './service';

export interface SkillTurnTools {
  officeCreation: boolean;
  codeExecution: boolean;
}

export function skillTurnTools(requiredTools: readonly string[] | undefined): SkillTurnTools {
  const needed = new Set(requiredTools ?? []);
  return {
    officeCreation: needed.has(MANAGED_OFFICE_FILE_TOOL_NAME),
    codeExecution: needed.has(CHAT_CODE_RUN_TOOL_NAME),
  };
}

export function enableSkillCodeExecution(
  requiredTools: readonly string[] | undefined,
  conversationId?: string | null,
): boolean {
  if (!skillTurnTools(requiredTools).codeExecution) return false;
  const view = useChatViewStore.getState();
  const tier = useTierStore.getState();
  if (
    !FEATURES.codeExecution ||
    !view.features.codeExecution ||
    !tier.codeExecutionAvailable ||
    !tier.grantedCapabilities.includes('canUseCloudExecution')
  ) {
    return false;
  }
  view.setRunCode(conversationId ?? view.styleConversationId ?? NEW_CHAT_STYLE_KEY, true);
  return true;
}

const MAX_MENTION_SKILLS = 4;

export function skillsMatchingMention(
  skills: readonly ManagedSkillSummary[],
  query: string,
): ManagedSkillSummary[] {
  const needle = query.trim().toLowerCase();
  return skills
    .filter((skill) => skill.lifecycle === 'included')
    .filter(
      (skill) =>
        needle.length === 0 ||
        skill.name.toLowerCase().includes(needle) ||
        (skill.title?.toLowerCase().includes(needle) ?? false),
    )
    .slice(0, MAX_MENTION_SKILLS);
}
