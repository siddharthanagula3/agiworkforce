/**
 * Chat AI Service
 * Bridges the chat UI to the real /api/llm/completion backend with SSE streaming.
 * Provides methods for sending messages, listing skills, and auto-detecting skills.
 */

import { createClient } from '@/utils/supabase/client';
import { useModelStore } from '@shared/stores/model-store';
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

/**
 * Get the Supabase auth token for API calls
 */
async function getAuthToken(): Promise<string> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated. Please sign in to continue.');
  }
  return session.access_token;
}

/**
 * Parse an SSE line and extract content delta.
 * Handles OpenAI-compatible format: data: {"choices":[{"delta":{"content":"..."}}]}
 */
function extractContentFromSSE(line: string): string | null {
  if (!line.startsWith('data: ')) return null;
  const jsonStr = line.slice(6).trim();
  if (jsonStr === '[DONE]') return null;

  try {
    const event = JSON.parse(jsonStr) as {
      choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
      type?: string;
      delta?: { text?: string };
      content_block?: { text?: string };
    };

    // OpenAI-compatible format (used by the API route for streaming)
    if (event.choices?.[0]?.delta?.content) {
      return event.choices[0].delta.content;
    }

    // Anthropic streaming format
    if (event.type === 'content_block_delta' && event.delta && 'text' in event.delta) {
      return event.delta.text ?? null;
    }

    return null;
  } catch {
    return null;
  }
}

export class ChatAIService {
  /**
   * Send a message and get a streamed response via /api/llm/completion.
   * Uses SSE streaming with native fetch + ReadableStream.
   */
  static async sendMessage(params: {
    sessionId: string;
    content: string;
    skillId?: string;
    conversationHistory: Array<{ role: string; content: string }>;
    onChunk?: (chunk: string) => void;
  }): Promise<string> {
    const { content, skillId, conversationHistory, onChunk } = params;

    try {
      const token = await getAuthToken();
      const modelId = useModelStore.getState().selectedModelId;

      // Build messages array: conversation history + current user message
      const messages = [
        ...conversationHistory.map((msg) => ({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
        })),
        { role: 'user' as const, content },
      ];

      const requestBody: Record<string, unknown> = {
        model: modelId,
        messages,
        stream: true,
        max_tokens: 4096,
        temperature: 0.7,
      };

      // Pass skillId as metadata if a specific skill was chosen
      if (skillId && skillId !== 'auto') {
        requestBody['metadata'] = { skillId };
      }

      const response = await fetch('/api/llm/completion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({ error: 'Request failed' }))) as {
          error?: string;
          code?: string;
        };
        const errorMsg = errorData.error || `API request failed with status ${response.status}`;

        if (response.status === 401) {
          throw new Error('Authentication expired. Please sign in again.');
        }
        if (response.status === 402) {
          throw new Error(errorMsg);
        }
        if (response.status === 403) {
          throw new Error(errorMsg);
        }
        throw new Error(errorMsg);
      }

      // Non-streaming response fallback
      if (!response.body) {
        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const text = data.choices?.[0]?.message?.content || '';
        if (onChunk) onChunk(text);
        return text;
      }

      // Stream SSE response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines from the buffer
        const lines = buffer.split('\n');
        // Keep the last (potentially incomplete) line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          const content_piece = extractContentFromSSE(trimmed);
          if (content_piece) {
            fullResponse += content_piece;
            if (onChunk) onChunk(content_piece);
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        const content_piece = extractContentFromSSE(buffer.trim());
        if (content_piece) {
          fullResponse += content_piece;
          if (onChunk) onChunk(content_piece);
        }
      }

      if (!fullResponse) {
        throw new Error('No response received from AI');
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
