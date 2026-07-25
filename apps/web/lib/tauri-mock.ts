// Mock implementation of Tauri invoke for the web app.
// The web app uses standard fetch calls instead of Tauri IPC.
// Chat and agent commands are routed to real Next.js API endpoints.
//
// STB-23: the default branch used to `return {} as T`. That handed the caller an
// empty object wearing the command's real static type, so `if (result.enabled)`,
// `result.items.length`, and every other read took the "absent/false/empty"
// branch as though the desktop runtime had answered. Unsupported commands now
// throw `TauriUnavailableError`, which callers must either guard with `isTauri`
// (the correct pattern — see shared/stores/tool-store.ts) or handle explicitly.

/**
 * Thrown when web code reaches a Tauri command that only the desktop runtime can
 * serve. Guard the call site with `isTauri` rather than catching this.
 */
export class TauriUnavailableError extends Error {
  readonly code = 'TAURI_UNAVAILABLE';

  constructor(readonly command: string) {
    super(
      `Tauri command '${command}' is not available in the web environment. ` +
        `It requires the Tauri desktop runtime — guard this call site with isTauri.`,
    );
    this.name = 'TauriUnavailableError';
  }
}

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
    // These are not available in the web environment — fail loudly (STB-23).
    // ----------------------------------------------------------------
    default: {
      throw new TauriUnavailableError(cmd);
    }
  }
}

export type UnlistenFn = () => void;

export const isTauri = false;

/**
 * STB-23: `listen()` used to resolve to a no-op unsubscribe, so a web caller
 * believed it had a live subscription to a Tauri event that can never fire.
 * There is no web equivalent of the Tauri event bus, so this fails loudly too.
 */
export async function listen<T = unknown>(
  event: string,
  _handler: (event: { payload: T }) => void,
): Promise<UnlistenFn> {
  void _handler;
  throw new TauriUnavailableError(`listen(${event})`);
}

/**
 * STB-23: `emit()` used to be a silent no-op, so a web caller believed its event
 * had been published. Desktop uses Tauri's event bus; the web bundle has none.
 */
export async function emit(event: string, _payload?: unknown): Promise<void> {
  void _payload;
  throw new TauriUnavailableError(`emit(${event})`);
}
