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
      return [
        {
          id: 1,
          title: 'Test Conversation',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ] as T; // Seed conversations for tests

    case 'get_messages':
    case 'load_messages':
    case 'chat_get_messages':
      return [
        {
          id: 1,
          conversation_id: 1,
          role: 'user',
          content: 'Hello',
          created_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 2,
          conversation_id: 1,
          role: 'assistant',
          content: 'Hi there!',
          created_at: '2024-01-01T00:00:01Z',
        },
      ] as T;

    case 'chat_get_conversation_stats':
      return {
        message_count: 2,
        total_tokens: 100,
        total_cost: 0.01,
      } as T;

    case 'create_conversation':
    case 'chat_create_conversation':
      return {
        id: 1,
        title: (args?.['request'] as any)?.title ?? args?.['title'] ?? 'New Conversation',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      } as T;

    case 'send_message':
    case 'chat_send_message':
      return {
        conversation: {
          id: 1,
          title: 'Test Conversation',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
        user_message: {
          id: 1,
          conversation_id: 1,
          role: 'user',
          content: (args?.['request'] as any)?.content ?? 'User message',
          created_at: '2024-01-01T00:00:00Z',
        },
        assistant_message: {
          id: 2,
          conversation_id: 1,
          role: 'assistant',
          content: 'Mock response',
          created_at: '2024-01-01T00:00:01Z',
        },
        stats: {
          message_count: 2,
          total_tokens: 100,
          total_cost: 0.01,
        },
        last_message: 'Mock response',
      } as T;

    case 'router_suggestions':
      return {
        provider: 'openai',
        model: 'gpt-5.1',
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
 * Convert a file path to a URL that can be loaded by the webview
 */
export function convertFileSrc(filePath: string, protocol = 'asset'): string {
  if (isTauri) {
    // In real Tauri, we can't easily import this synchronously if we want to be safe,
    // but convertFileSrc is usually synchronous in v2 core.
    // However, since we are mocking, we can try to use the window.__TAURI__ object if available
    // or just return a placeholder if we can't access the real API dynamically.
    // For now, let's assume if we are in Tauri, we might need to rely on the real import in the component
    // OR we can try to access it from window if exposed.
    // But to keep it simple and consistent with invoke:
    
    // Note: convertFileSrc is synchronous.
    // If we want to use the real one, we'd need to import it.
    // But imports are static or async.
    // So we'll just implement the standard transformation for Windows/Tauri v2.
    
    const encode = encodeURIComponent;
    return `${protocol}://localhost/${encode(filePath)}`;
  }
  
  // In web mode, just return the path or a placeholder
  return filePath;
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
