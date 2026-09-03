export class TauriUnavailableError extends Error {
  readonly code = 'TAURI_UNAVAILABLE';

  constructor(readonly command: string) {
    super(
      `Tauri command '${command}' is not available in the web environment. ` +
        `It requires the Tauri desktop runtime, guard this call site with isTauri.`,
    );
    this.name = 'TauriUnavailableError';
  }
}

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  switch (cmd) {
    case 'chat_add_pending_message': {
      const request = (args?.['request'] ?? args) as Record<string, unknown>;
      const response = await fetch('/api/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:
            typeof request?.['content'] === 'string'
              ? (request['content'] as string).slice(0, 50)
              : 'New conversation',
        }),
      });
      if (!response.ok) {
        throw new Error(`chat_add_pending_message failed: ${response.status}`);
      }
      const data = (await response.json()) as { conversation: { id: string; title: string } };
      return {
        id: data.conversation.id,
        content: request?.['content'] ?? '',
        conversation_id: data.conversation.id,
        created_at: new Date().toISOString(),
      } as unknown as T;
    }

    case 'chat_stop_generation': {
      console.warn('[tauri-mock] chat_stop_generation: use AbortController in web environment');
      return undefined as unknown as T;
    }

    case 'cancel_tool_execution': {
      console.warn('[tauri-mock] cancel_tool_execution is a no-op in the web environment');
      return undefined as unknown as T;
    }

    case 'error_report': {
      console.error('[tauri-mock] error_report:', args?.['errorData'] ?? args);
      return undefined as unknown as T;
    }

    case 'project_context_set_folder': {
      return undefined as unknown as T;
    }

    default: {
      throw new TauriUnavailableError(cmd);
    }
  }
}

export type UnlistenFn = () => void;

export const isTauri = false;

export async function listen<T = unknown>(
  event: string,
  _handler: (event: { payload: T }) => void,
): Promise<UnlistenFn> {
  void _handler;
  throw new TauriUnavailableError(`listen(${event})`);
}

export async function emit(event: string, _payload?: unknown): Promise<void> {
  void _payload;
  throw new TauriUnavailableError(`emit(${event})`);
}
