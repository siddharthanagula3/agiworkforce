/**
 * Chat AI Service
 * Bridges the chat UI to the AI backend (workforce orchestrator + skill routing).
 * Provides methods for sending messages, listing skills, and auto-detecting skills.
 */

import { workforceOrchestratorRefactored } from '@core/ai/orchestration/workforce-orchestrator';
import { systemPromptsService } from '@core/ai/employees/prompt-management';
import {
  IntelligentAgentRouter,
  RoleExpertiseMapping,
  SkillCategories,
} from '@core/ai/orchestration/intelligent-agent-router';
import type { AIEmployee } from '@core/types/ai-employee';

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  category: string;
  avatar?: string;
}

/**
 * Singleton router instance used for skill detection
 */
let routerInstance: IntelligentAgentRouter | null = null;

function getRouter(): IntelligentAgentRouter {
  if (!routerInstance) {
    routerInstance = new IntelligentAgentRouter();
  }
  return routerInstance;
}

/**
 * Cache for loaded employees
 */
let cachedEmployees: AIEmployee[] | null = null;
let employeesLoading: Promise<AIEmployee[]> | null = null;

async function loadEmployees(): Promise<AIEmployee[]> {
  if (cachedEmployees) return cachedEmployees;
  if (employeesLoading) return employeesLoading;

  employeesLoading = systemPromptsService
    .getAvailableEmployees()
    .then((employees) => {
      cachedEmployees = employees;
      employeesLoading = null;
      return employees;
    })
    .catch((err) => {
      console.error('[ChatAIService] Failed to load employees:', err);
      employeesLoading = null;
      return [];
    });

  return employeesLoading;
}

/**
 * Find which category a skill belongs to
 */
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
   * Send a message and get a response (with optional skill).
   * Calls the workforce orchestrator and simulates streaming by chunking the response.
   */
  static async sendMessage(params: {
    sessionId: string;
    content: string;
    skillId?: string;
    conversationHistory: Array<{ role: string; content: string }>;
    onChunk?: (chunk: string) => void;
  }): Promise<string> {
    const { sessionId, content, skillId, conversationHistory, onChunk } = params;

    try {
      let fullResponse: string;

      if (skillId && skillId !== 'auto') {
        // Route to a specific skill via the simplified chatWithSkill path
        fullResponse = await workforceOrchestratorRefactored.chatWithSkill(
          skillId,
          content,
          sessionId,
          conversationHistory as Array<{
            role: 'user' | 'assistant' | 'system';
            content: string;
          }>,
        );
      } else {
        // Let the orchestrator auto-route (chat mode)
        const result = await workforceOrchestratorRefactored.processRequest({
          userId: 'anonymous',
          input: content,
          mode: 'chat',
          sessionId,
          conversationHistory: conversationHistory as Array<{
            role: 'user' | 'assistant' | 'system';
            content: string;
          }>,
        });

        if (!result.success || !result.chatResponse) {
          throw new Error(result.error || 'No response from AI');
        }

        fullResponse = result.chatResponse;
      }

      // Simulate streaming by splitting into word chunks
      if (onChunk) {
        const chunks = fullResponse.split(/(\s+)/).filter((part) => part.length > 0);
        for (const chunk of chunks) {
          onChunk(chunk);
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      }

      return fullResponse;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      console.error('[ChatAIService] sendMessage error:', error);
      throw new Error(errorMessage);
    }
  }

  /**
   * Get available skills for @mention autocomplete.
   * Returns a simplified list with id, name, description, and category.
   */
  static async getAvailableSkills(): Promise<SkillInfo[]> {
    const employees = await loadEmployees();

    return employees.map((emp) => ({
      id: emp.name,
      name: formatSkillName(emp.name),
      description: emp.description,
      category: getCategoryForSkill(emp.name),
      avatar: emp.avatar,
    }));
  }

  /**
   * Synchronous version that returns whatever is cached (may be empty on first call).
   * Triggers a background load if not yet loaded.
   */
  static getAvailableSkillsSync(): SkillInfo[] {
    // Trigger load in background if not cached yet
    if (!cachedEmployees) {
      loadEmployees();
      // Return a small default set based on RoleExpertiseMapping keys
      return getDefaultSkills();
    }

    return cachedEmployees.map((emp) => ({
      id: emp.name,
      name: formatSkillName(emp.name),
      description: emp.description,
      category: getCategoryForSkill(emp.name),
      avatar: emp.avatar,
    }));
  }

  /**
   * Auto-detect the best skill for a given message using the intelligent agent router.
   * Returns the skill ID or null if no strong match is found.
   */
  static async detectSkill(message: string): Promise<string | null> {
    const employees = await loadEmployees();
    if (employees.length === 0) return null;

    const router = getRouter();

    // Register agents if not already registered
    const agentCapabilities = employees.map((emp) => ({
      agentId: emp.name,
      name: formatSkillName(emp.name),
      expertise: emp.expertise || RoleExpertiseMapping[emp.name] || [],
      tools: emp.tools,
      systemPrompt: emp.systemPrompt || '',
      model: (emp.model as string) || 'gpt-4o',
      temperature: 0.7,
    }));

    router.registerAgents(agentCapabilities);

    // Route the query
    const results = router.routeQuery(message, {
      maxAgents: 1,
      minConfidence: 'medium',
      allowMultiple: false,
    });

    return results.length > 0 ? results[0] : null;
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
