/**
 * Chat AI Service
 * Provides skill metadata and stop-generation control for the chat UI.
 *
 * Note: SSE streaming is handled directly by useChatStream (lib/hooks/useChatStream.ts)
 * via /api/llm/v1/chat/completions. The sendMessage() method that duplicated that
 * path was removed (had zero production callers).
 */

import { SkillCategories } from './intelligent-agent-router';

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  category: string;
  avatar?: string;
}

/**
 * Active AbortController for the current streaming request.
 * Set by useChatStream; cleared by stopGeneration().
 */
let activeAbortController: AbortController | null = null;

function getCategoryForSkill(skillId: string): string {
  for (const cat of SkillCategories) {
    if (cat.skills.includes(skillId)) {
      return cat.name;
    }
  }
  return 'General';
}

export class ChatAIService {
  /**
   * Abort the currently active streaming request, if any.
   */
  static stopGeneration(): void {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
  }

  /**
   * Get available skills for @mention autocomplete.
   */
  static async getAvailableSkills(): Promise<SkillInfo[]> {
    return getDefaultSkills();
  }

  /**
   * Synchronous version returning the default skill list.
   */
  static getAvailableSkillsSync(): SkillInfo[] {
    return getDefaultSkills();
  }

  /**
   * Auto-detect the best skill for a given message.
   * Returns null until a server-backed skill registry is reintroduced.
   */
  static async detectSkill(_message: string): Promise<string | null> {
    return null;
  }

  /**
   * Get skill categories for browsing
   */
  static getSkillCategories() {
    return SkillCategories;
  }
}

/**
 * Format a kebab-case skill ID into a human-readable name.
 * e.g. "backend-engineer" -> "Backend Engineer"
 */
function formatSkillName(skillId: string): string {
  return skillId
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Returns a small default skill list from RoleExpertiseMapping keys
 * (used as fallback before employees are loaded from the backend).
 */
function getDefaultSkills(): SkillInfo[] {
  const topSkills = [
    'backend-engineer',
    'frontend-engineer',
    'code-reviewer',
    'financial-advisor',
    'health-advisor',
    'ai-lawyer',
    'expert-tutor',
    'travel-advisor',
    'career-counselor',
    'life-coach',
    'personal-trainer',
    'expert-chef',
    'mental-health-counselor',
    'home-advisor',
    'tech-support-specialist',
  ];

  return topSkills.map((id) => ({
    id,
    name: formatSkillName(id),
    description: `AI ${formatSkillName(id)} skill`,
    category: getCategoryForSkill(id),
  }));
}
