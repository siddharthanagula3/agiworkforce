// TODO(task-1.3): migrate to packages/runtime/state (see AppStateStore.ts domain mapping)
/**
 * Canvas Store
 *
 * Manages code artifacts for the Canvas/Code Execution Workspace.
 * Supports HTML, Markdown, code (Python, JS, TS, bash, etc.) and document types.
 * Code execution goes through Tauri invoke with graceful fallback.
 *
 * Also wires the backend canvas commands from canvas.rs:
 * - canvas_create, canvas_get, canvas_list, canvas_destroy
 * - canvas_set_active, canvas_get_active
 * - canvas_add_element, canvas_remove_element, canvas_update_element
 * - canvas_clear, canvas_export, canvas_a2ui_execute, canvas_add_text
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { toast } from 'sonner';
import { invoke } from '../lib/tauri-mock';

// =============================================================================
// Types
// =============================================================================

export type CanvasArtifactType = 'code' | 'html' | 'markdown' | 'document';

export type ExecutionState = 'idle' | 'running' | 'success' | 'error';

export interface CanvasArtifact {
  id: string;
  type: CanvasArtifactType;
  language?: string; // for code: 'python', 'javascript', 'typescript', 'bash', etc.
  title: string;
  content: string;
  previewContent?: string; // compiled/executed output
  executionState: ExecutionState;
  executionOutput?: string;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
  messageId?: string; // which chat message spawned this
}

/** Backend canvas element (matches Rust CanvasElement) */
export interface BackendCanvasElement {
  id: string;
  [key: string]: unknown;
}

/** A2UI command for AGI-driven canvas operations */
export interface A2UICommand {
  action: string;
  [key: string]: unknown;
}

/** A2UI response from the backend */
export interface A2UIResponse {
  success: boolean;
  message?: string;
  data?: unknown;
}

/** Element style for canvas text elements */
export interface CanvasElementStyle {
  fontSize?: number;
  fontWeight?: string;
  color?: string;
  backgroundColor?: string;
  [key: string]: unknown;
}

/** Summary entry from canvas_list */
export interface CanvasSummary {
  id: string;
  name: string;
}

interface CanvasStoreState {
  artifacts: CanvasArtifact[];
  activeArtifactId: string | null;
  isPanelOpen: boolean;

  /** Backend canvases */
  backendCanvases: CanvasSummary[];
  activeBackendCanvasId: string | null;
  loadingBackendCanvases: boolean;
  backendError: string | null;

  // Artifact actions (existing)
  createArtifact: (
    type: CanvasArtifactType,
    content: string,
    language?: string,
    title?: string,
    messageId?: string,
  ) => string;
  updateArtifact: (id: string, updates: Partial<CanvasArtifact>) => void;
  executeArtifact: (id: string) => Promise<void>;
  deleteArtifact: (id: string) => void;
  openPanel: (artifactId?: string) => void;
  closePanel: () => void;

  // Backend canvas actions (new)
  createBackendCanvas: (name: string, width?: number, height?: number) => Promise<string | null>;
  getBackendCanvas: (id: string) => Promise<unknown | null>;
  listBackendCanvases: () => Promise<CanvasSummary[]>;
  destroyBackendCanvas: (id: string) => Promise<boolean>;
  setActiveBackendCanvas: (id: string | null) => Promise<boolean>;
  getActiveBackendCanvas: () => Promise<string | null>;
  addElement: (canvasId: string, element: BackendCanvasElement) => Promise<boolean>;
  removeElement: (canvasId: string, elementId: string) => Promise<boolean>;
  updateElement: (
    canvasId: string,
    elementId: string,
    updates: Record<string, unknown>,
  ) => Promise<boolean>;
  clearCanvas: (canvasId: string) => Promise<boolean>;
  exportCanvas: (canvasId: string) => Promise<string | null>;
  executeA2UI: (command: A2UICommand) => Promise<A2UIResponse | null>;
  addTextElement: (
    canvasId: string,
    text: string,
    x: number,
    y: number,
    width?: number,
    style?: CanvasElementStyle,
  ) => Promise<string | null>;
}

// =============================================================================
// Helpers
// =============================================================================

function generateId(): string {
  return `canvas_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function deriveTitle(type: CanvasArtifactType, language?: string): string {
  if (type === 'html') return 'HTML Preview';
  if (type === 'markdown') return 'Markdown Document';
  if (type === 'document') return 'Document';
  if (language) {
    const langMap: Record<string, string> = {
      python: 'Python Script',
      javascript: 'JavaScript',
      typescript: 'TypeScript',
      bash: 'Shell Script',
      sh: 'Shell Script',
      sql: 'SQL Query',
      rust: 'Rust Code',
      go: 'Go Code',
      java: 'Java Code',
    };
    return langMap[language.toLowerCase()] ?? `${language} Code`;
  }
  return 'Code Snippet';
}

/**
 * Attempt to execute code via Tauri. Tries two command names in order,
 * falling back to a user-friendly message if neither is available.
 */
async function runCodeViaTauri(
  language: string,
  code: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  // Sanitize for shell embedding — use a temp-file approach via terminal_execute
  // Prefer execute_code command if registered; fall back to terminal_execute
  try {
    const result = await invoke<{ stdout: string; stderr: string; exit_code: number }>(
      'execute_code',
      { language, code },
    );
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exit_code,
    };
  } catch {
    // try terminal_execute as fallback
  }

  try {
    const escaped = code.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
    let command: string;
    switch (language.toLowerCase()) {
      case 'python':
      case 'python3':
        command = `python3 -c "${escaped}"`;
        break;
      case 'javascript':
      case 'js':
        command = `node -e "${escaped}"`;
        break;
      case 'bash':
      case 'sh':
        command = `bash -c "${escaped}"`;
        break;
      default:
        throw new Error(`Unsupported language for execution: ${language}`);
    }
    const result = await invoke<{ stdout: string; stderr: string; exit_code: number }>(
      'terminal_execute',
      { command, workingDir: null },
    );
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exit_code,
    };
  } catch (err) {
    throw err;
  }
}

// =============================================================================
// Store
// =============================================================================

export const useCanvasStore = create<CanvasStoreState>()(
  devtools(
    (set, get) => ({
      artifacts: [],
      activeArtifactId: null,
      isPanelOpen: false,

      backendCanvases: [],
      activeBackendCanvasId: null,
      loadingBackendCanvases: false,
      backendError: null,

      createArtifact: (type, content, language, title, messageId) => {
        const id = generateId();
        const now = Date.now();
        const artifact: CanvasArtifact = {
          id,
          type,
          language,
          title: title ?? deriveTitle(type, language),
          content,
          executionState: 'idle',
          createdAt: now,
          updatedAt: now,
          messageId,
        };
        set((state) => ({ artifacts: [...state.artifacts, artifact] }));
        return id;
      },

      updateArtifact: (id, updates) => {
        set((state) => ({
          artifacts: state.artifacts.map((a) =>
            a.id === id ? { ...a, ...updates, updatedAt: Date.now() } : a,
          ),
        }));
      },

      executeArtifact: async (id) => {
        const artifact = get().artifacts.find((a) => a.id === id);
        if (!artifact) return;

        const executableLanguages = ['python', 'python3', 'javascript', 'js', 'bash', 'sh'];
        const lang = (artifact.language ?? '').toLowerCase();

        if (artifact.type !== 'code' || !executableLanguages.includes(lang)) {
          toast.info('Execution is only available for Python, JavaScript, and Bash code.');
          return;
        }

        get().updateArtifact(id, {
          executionState: 'running',
          executionOutput: undefined,
          errorMessage: undefined,
        });

        try {
          const result = await runCodeViaTauri(lang, artifact.content);
          const output = result.stdout || result.stderr;
          const hasError = result.exitCode !== 0 || (result.stderr.length > 0 && !result.stdout);

          get().updateArtifact(id, {
            executionState: hasError ? 'error' : 'success',
            executionOutput: output,
            errorMessage: hasError ? result.stderr || 'Non-zero exit code' : undefined,
          });

          if (hasError) {
            toast.error('Code execution failed');
          } else {
            toast.success('Code executed successfully');
          }
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Code execution requires the desktop application';
          get().updateArtifact(id, {
            executionState: 'error',
            errorMessage: message,
          });
          toast.error(message.includes('desktop') ? message : 'Execution failed: ' + message);
        }
      },

      deleteArtifact: (id) => {
        set((state) => {
          const remaining = state.artifacts.filter((a) => a.id !== id);
          const newActive =
            state.activeArtifactId === id
              ? (remaining[remaining.length - 1]?.id ?? null)
              : state.activeArtifactId;
          return {
            artifacts: remaining,
            activeArtifactId: newActive,
            isPanelOpen: remaining.length > 0 ? state.isPanelOpen : false,
          };
        });
      },

      openPanel: (artifactId) => {
        set((state) => ({
          isPanelOpen: true,
          activeArtifactId: artifactId ?? state.activeArtifactId,
        }));
      },

      closePanel: () => {
        set({ isPanelOpen: false });
      },

      // =========================================================================
      // Backend Canvas Actions (wired to canvas.rs Tauri commands)
      // =========================================================================

      createBackendCanvas: async (name, width, height) => {
        set({ backendError: null });
        try {
          const id = await invoke<string>('canvas_create', { name, width, height });
          set((state) => ({
            backendCanvases: [...state.backendCanvases, { id, name }],
          }));
          return id;
        } catch (error) {
          console.error('Failed to create backend canvas:', error);
          set({ backendError: String(error) });
          return null;
        }
      },

      getBackendCanvas: async (id) => {
        try {
          return await invoke<unknown>('canvas_get', { id });
        } catch (error) {
          console.error('Failed to get backend canvas:', error);
          set({ backendError: String(error) });
          return null;
        }
      },

      listBackendCanvases: async () => {
        set({ loadingBackendCanvases: true, backendError: null });
        try {
          const entries = await invoke<[string, string][]>('canvas_list');
          const canvases = entries.map(([id, name]) => ({ id, name }));
          set({ backendCanvases: canvases, loadingBackendCanvases: false });
          return canvases;
        } catch (error) {
          console.error('Failed to list backend canvases:', error);
          set({ backendError: String(error), loadingBackendCanvases: false });
          return [];
        }
      },

      destroyBackendCanvas: async (id) => {
        try {
          await invoke<boolean>('canvas_destroy', { id });
          set((state) => ({
            backendCanvases: state.backendCanvases.filter((c) => c.id !== id),
            activeBackendCanvasId:
              state.activeBackendCanvasId === id ? null : state.activeBackendCanvasId,
          }));
          return true;
        } catch (error) {
          console.error('Failed to destroy backend canvas:', error);
          set({ backendError: String(error) });
          return false;
        }
      },

      setActiveBackendCanvas: async (id) => {
        try {
          await invoke('canvas_set_active', { id });
          set({ activeBackendCanvasId: id });
          return true;
        } catch (error) {
          console.error('Failed to set active canvas:', error);
          set({ backendError: String(error) });
          return false;
        }
      },

      getActiveBackendCanvas: async () => {
        try {
          const id = await invoke<string | null>('canvas_get_active');
          set({ activeBackendCanvasId: id });
          return id;
        } catch (error) {
          console.error('Failed to get active canvas:', error);
          return null;
        }
      },

      addElement: async (canvasId, element) => {
        try {
          await invoke('canvas_add_element', { canvasId, element });
          return true;
        } catch (error) {
          console.error('Failed to add element to canvas:', error);
          set({ backendError: String(error) });
          return false;
        }
      },

      removeElement: async (canvasId, elementId) => {
        try {
          await invoke<boolean>('canvas_remove_element', { canvasId, elementId });
          return true;
        } catch (error) {
          console.error('Failed to remove element from canvas:', error);
          set({ backendError: String(error) });
          return false;
        }
      },

      updateElement: async (canvasId, elementId, updates) => {
        try {
          await invoke<boolean>('canvas_update_element', { canvasId, elementId, updates });
          return true;
        } catch (error) {
          console.error('Failed to update element on canvas:', error);
          set({ backendError: String(error) });
          return false;
        }
      },

      clearCanvas: async (canvasId) => {
        try {
          await invoke('canvas_clear', { canvasId });
          return true;
        } catch (error) {
          console.error('Failed to clear canvas:', error);
          set({ backendError: String(error) });
          return false;
        }
      },

      exportCanvas: async (canvasId) => {
        try {
          return await invoke<string>('canvas_export', { canvasId });
        } catch (error) {
          console.error('Failed to export canvas:', error);
          set({ backendError: String(error) });
          return null;
        }
      },

      executeA2UI: async (command) => {
        try {
          return await invoke<A2UIResponse>('canvas_a2ui_execute', { command });
        } catch (error) {
          console.error('Failed to execute A2UI command:', error);
          set({ backendError: String(error) });
          return null;
        }
      },

      addTextElement: async (canvasId, text, x, y, width, style) => {
        try {
          return await invoke<string>('canvas_add_text', {
            canvasId,
            text,
            x,
            y,
            width,
            style,
          });
        } catch (error) {
          console.error('Failed to add text element:', error);
          set({ backendError: String(error) });
          return null;
        }
      },
    }),
    { name: 'CanvasStore', enabled: import.meta.env.DEV },
  ),
);
