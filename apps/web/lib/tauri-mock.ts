// Mock implementation of Tauri invoke for the web app.
// The web app uses standard fetch calls instead of Tauri IPC.
// Chat and agent commands are routed to real Next.js API endpoints.
// Desktop-only commands (file I/O, git, browser automation) return empty
// objects gracefully so callers don't crash in the web environment.

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  switch (cmd) {
    // ----------------------------------------------------------------
    // Chat – queue a pending message (used by useChatSubmit queue mode)
    // ----------------------------------------------------------------
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
      // Return a PendingUserMessage-compatible shape
      return {
        id: data.conversation.id,
        content: request?.['content'] ?? '',
        conversation_id: data.conversation.id,
        created_at: new Date().toISOString(),
      } as unknown as T;
    }

    // ----------------------------------------------------------------
    // Chat – stop generation (no-op in web; streaming is aborted client-side)
    // ----------------------------------------------------------------
    case 'chat_stop_generation': {
      console.warn('[tauri-mock] chat_stop_generation: use AbortController in web environment');
      return undefined as unknown as T;
    }

    // ----------------------------------------------------------------
    // Tool execution cancellation (no-op in web; handled by fetch AbortController)
    // ----------------------------------------------------------------
    case 'cancel_tool_execution': {
      console.warn('[tauri-mock] cancel_tool_execution is a no-op in the web environment');
      return undefined as unknown as T;
    }

    // ----------------------------------------------------------------
    // Error reporting (fire-and-forget to /api/error-report if it exists)
    // ----------------------------------------------------------------
    case 'error_report': {
      console.error('[tauri-mock] error_report:', args?.['errorData'] ?? args);
      return undefined as unknown as T;
    }

    // ----------------------------------------------------------------
    // Project context folder – no-op in web (no local filesystem)
    // ----------------------------------------------------------------
    case 'project_context_set_folder': {
      return undefined as unknown as T;
    }

    // ----------------------------------------------------------------
    // Default: desktop-only commands (file I/O, git, browser automation, etc.)
    // These are not available in the web environment.
    // ----------------------------------------------------------------
    default: {
      console.warn(
        `[tauri-mock] Unhandled Tauri command '${cmd}' in web environment. ` +
          `This command requires the Tauri desktop runtime.`,
      );
      return {} as T;
    }
  }
}

export type UnlistenFn = () => void;

export const isTauri = false;

export async function listen<T = unknown>(
  event: string,
  _handler: (event: { payload: T }) => void,
): Promise<UnlistenFn> {
  console.warn(`[tauri-mock] Called listen('${event}') in web environment.`);
  return () => {};
}

/**
 * Stub for Tauri's emit() - no-op in web environment.
 * Desktop uses Tauri's event bus; web components that call emit() are no-ops here.
 */
export async function emit(event: string, _payload?: unknown): Promise<void> {
  console.warn(`[tauri-mock] Called emit('${event}') in web environment.`);
}
