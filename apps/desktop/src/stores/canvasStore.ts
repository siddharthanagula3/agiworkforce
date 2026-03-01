/**
 * Canvas Store
 *
 * Manages code artifacts for the Canvas/Code Execution Workspace.
 * Supports HTML, Markdown, code (Python, JS, TS, bash, etc.) and document types.
 * Code execution goes through Tauri invoke with graceful fallback.
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

interface CanvasStoreState {
  artifacts: CanvasArtifact[];
  activeArtifactId: string | null;
  isPanelOpen: boolean;

  // Actions
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
    }),
    { name: 'CanvasStore', enabled: import.meta.env.DEV },
  ),
);
