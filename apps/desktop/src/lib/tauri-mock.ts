/**
 * Tauri API Mock Layer for Web Development
 *
 * Provides mock implementations of Tauri APIs when running in web-only mode (Vite dev server).
 * This allows the app to run in the browser without Tauri while preserving full functionality
 * during development.
 */

// Detect if we're running in Tauri context
export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// Mock data for development
const MOCK_DATA = {
  onboarding_status: { completed: true },
  templates: [],
  installed_templates: [],
  workflows: [],
  teams: [],
  settings: {
    theme: 'dark',
    apiKeys: {},
  },
};

/**
 * Safe invoke wrapper that mocks Tauri commands in web mode
 */
export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) {
    // Dynamically import Tauri API only in Tauri context
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
    return tauriInvoke<T>(command, args);
  }

  // Mock responses for common commands
  console.log(`[Tauri Mock] ${command}`, args);

  switch (command) {
    case 'get_onboarding_status':
      return MOCK_DATA.onboarding_status as T;

    case 'get_templates':
      return MOCK_DATA.templates as T;

    case 'get_installed_templates':
      return MOCK_DATA.installed_templates as T;

    case 'get_workflows':
      return MOCK_DATA.workflows as T;

    case 'get_user_teams':
      return MOCK_DATA.teams as T;

    case 'get_settings':
      return MOCK_DATA.settings as T;

    case 'get_conversations':
    case 'load_conversations':
    case 'chat_get_conversations':
      return [] as T; // Return empty array for conversations

    case 'get_messages':
    case 'load_messages':
    case 'chat_get_messages':
      return [] as T; // Return empty array for messages

    case 'chat_get_conversation_stats':
      return {
        message_count: 0,
        token_count: 0,
        last_activity: Date.now(),
      } as T;

    case 'create_conversation':
    case 'chat_create_conversation':
      return { id: `conv-${Date.now()}`, title: args?.['title'] || 'New Conversation' } as T;

    case 'send_message':
    case 'chat_send_message':
      return {
        id: `msg-${Date.now()}`,
        content: 'Mock response',
        role: 'assistant',
      } as T;

    case 'router_suggestions':
      return {
        provider: 'openai',
        model: 'gpt-4o-mini',
        reason: 'Mock suggestion: defaulting to OpenAI in web preview mode.',
      } as T;

    case 'orchestrator_init_default':
      return undefined as T;

    case 'orchestrator_spawn_agent':
      return { agent_id: `mock-agent-${Date.now()}` } as T;

    case 'orchestrator_list_agents':
      return [] as T;

    case 'orchestrator_cancel_agent':
      return undefined as T;

    // Add more mock responses as needed
    default:
      console.warn(`[Tauri Mock] No mock for command: ${command}`);
      // Return empty array as default (safer than empty object)
      return Promise.resolve([] as T);
  }
}

/**
 * Check if running in Tauri context
 */
export function isTauriContext(): boolean {
  return isTauri;
}

/**
 * Get mock status for debugging
 */
export function getMockStatus(): { isTauri: boolean; mode: string } {
  return {
    isTauri,
    mode: isTauri ? 'tauri' : 'web-mock',
  };
}
