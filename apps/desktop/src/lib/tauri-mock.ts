


export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;


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


export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) {
    
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
    return tauriInvoke<T>(command, args);
  }

  

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
      ] as T; 

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

    
    default:
      console.warn(`[Tauri Mock] No mock for command: ${command}`);
      
      return Promise.resolve([] as T);
  }
}


export function convertFileSrc(filePath: string, protocol = 'asset'): string {
  if (isTauri) {
    
    
    
    
    
    
    

    
    
    
    

    const encode = encodeURIComponent;
    return `${protocol}://localhost/${encode(filePath)}`;
  }

  
  return filePath;
}


export function isTauriContext(): boolean {
  return isTauri;
}


export function getMockStatus(): { isTauri: boolean; mode: string } {
  return {
    isTauri,
    mode: isTauri ? 'tauri' : 'web-mock',
  };
}


export type EventCallback<T> = (event: { payload: T; id: number }) => void;


export type UnlistenFn = () => void;


export async function listen<T>(event: string, handler: EventCallback<T>): Promise<UnlistenFn> {
  if (isTauri) {
    // Dynamically import Tauri API to avoid issues in non-Tauri environments
    const { listen: tauriListen } = await import('@tauri-apps/api/event');
    return tauriListen<T>(event, handler);
  }

  // Mock implementation for web
  console.debug(`[Tauri Mock] Registered listener for event: ${event}`);

  // Return a mock unlisten function
  return () => {
    console.debug(`[Tauri Mock] Unregistered listener for event: ${event}`);
  };
}


export async function emit(event: string, payload?: unknown): Promise<void> {
  if (isTauri) {
    const { emit: tauriEmit } = await import('@tauri-apps/api/event');
    return tauriEmit(event, payload);
  }

  console.debug(`[Tauri Mock] Emitted event: ${event}`, payload);
}


export async function once<T>(event: string, handler: EventCallback<T>): Promise<UnlistenFn> {
  if (isTauri) {
    const { once: tauriOnce } = await import('@tauri-apps/api/event');
    return tauriOnce<T>(event, handler);
  }

  console.debug(`[Tauri Mock] Registered one-time listener for event: ${event}`);
  return () => {
    console.debug(`[Tauri Mock] Unregistered one-time listener for event: ${event}`);
  };
}
