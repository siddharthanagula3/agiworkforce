import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '../lib/tauri-mock';
import type { EnhancedMessage } from './chat/types';

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface AppError {
  id: string;
  type: string;
  severity: ErrorSeverity;
  message: string;
  details?: string;
  stack?: string;
  timestamp: number;
  context?: Record<string, unknown>;
  dismissed: boolean;
  count: number;
}

export interface ErrorStatistics {
  totalErrors: number;
  errorsByType: Record<string, number>;
  errorsBySeverity: Record<ErrorSeverity, number>;
  recentErrors: AppError[];
}

export interface FileAttachment {
  id: string;
  file: File;
  previewUrl?: string;
  size: number;
  type: string;
  name: string;
}

export interface VoiceRecording {
  id: string;
  blob: Blob;
  duration: number;
  timestamp: Date;
}

export interface ContextMetadata {
  workspacePath?: string;
  selectedFilesCount: number;
  openEditorsCount: number;
}

interface DraftMessage {
  conversationId: number | null;
  content: string;
  timestamp: Date;
}

export type SidecarSection =
  | 'operations'
  | 'reasoning'
  | 'approvals'
  | 'files'
  | 'terminal'
  | 'browser'
  | 'media'
  | 'tools'
  | 'tasks'
  | 'agents';

export type SidecarMode =
  | 'code'
  | 'browser'
  | 'terminal'
  | 'preview'
  | 'diff'
  | 'canvas'
  | 'data'
  | 'extension'
  | 'git'
  | 'database'
  | 'filesystem'
  | 'vision'
  | 'computer-use'
  | 'swarm'
  | 'scheduler'
  | 'documents'
  | 'automation'
  | 'marketplace'
  | 'messaging'
  | 'productivity'
  | 'cloud'
  | 'governance'
  | 'agent-collab'
  | 'visual-editor'
  | 'dynamic-canvas';

export interface SidecarState {
  isOpen: boolean;
  activeMode: SidecarMode;
  contextId: string | null;
  context?: unknown;
  autoTrigger: boolean;
}

export type UIMode = 'simple' | 'advanced';

interface UIState {
  errors: AppError[];
  maxHistorySize: number;
  toasts: AppError[];
  maxToasts: number;

  drafts: Map<number | null, DraftMessage>;
  attachments: FileAttachment[];
  isRecording: boolean;
  recordingStartTime: Date | null;
  voiceRecordings: VoiceRecording[];
  contextMetadata: ContextMetadata;
  inputHeight: number;
  showMarkdownPreview: boolean;

  sidecarOpen: boolean;
  sidecarSection: SidecarSection;
  sidecarWidth: number;
  sidecarUserSelected: boolean;

  sidebarWidth: number;
  sidebarCollapsed: boolean;

  sidecar: SidecarState;

  mode: UIMode;
  onboardingCompleted: boolean;
  showModeSwitcherHint: boolean;

  addError: (error: Omit<AppError, 'id' | 'timestamp' | 'dismissed' | 'count'>) => void;
  dismissError: (id: string) => void;
  dismissAll: () => void;
  clearHistory: () => void;
  getStatistics: () => ErrorStatistics;
  exportLogs: () => Promise<string>;
  reportError: (errorId: string) => Promise<void>;

  setDraft: (conversationId: number | null, content: string) => void;
  getDraft: (conversationId: number | null) => string;
  clearDraft: (conversationId: number | null) => void;
  addAttachment: (file: File) => string;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  startRecording: () => void;
  stopRecording: (blob: Blob, duration: number) => void;
  removeRecording: (id: string) => void;
  updateContextMetadata: (metadata: Partial<ContextMetadata>) => void;
  setInputHeight: (height: number) => void;
  toggleMarkdownPreview: () => void;
  resetInput: () => void;

  setSidecarOpen: (open: boolean) => void;
  setSidecarSection: (section: SidecarSection) => void;
  setSidecarSectionFromEvent: (event: string) => void;
  setSidecarWidth: (width: number) => void;

  setSidebarWidth: (width: number) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  setSidecar: (state: Partial<SidecarState>) => void;
  openSidecar: (mode: SidecarMode, contextId?: string, context?: unknown) => void;
  closeSidecar: () => void;
  getSuggestedSidecarMode: (message: EnhancedMessage) => SidecarMode | null;

  setMode: (mode: UIMode) => void;
  toggleMode: () => void;
  completeOnboarding: () => void;
  dismissModeSwitcherHint: () => void;
  isSimpleMode: () => boolean;
  isAdvancedMode: () => boolean;

  resetOnLogout: () => void;
}

const STORAGE_VERSION = 1;

const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const storageFallback: Storage = {
  get length() {
    return 0;
  },
  clear: () => undefined,
  getItem: () => null,
  key: () => null,
  removeItem: () => undefined,
  setItem: () => undefined,
};

const dismissTimers = new Map<string, ReturnType<typeof setTimeout>>();

const clearDismissTimer = (id: string) => {
  const timerId = dismissTimers.get(id);
  if (timerId !== undefined) {
    clearTimeout(timerId);
    dismissTimers.delete(id);
  }
};

const clearAllDismissTimers = () => {
  dismissTimers.forEach((timerId) => clearTimeout(timerId));
  dismissTimers.clear();
};

const setDismissTimer = (id: string, timerId: ReturnType<typeof setTimeout>) => {
  dismissTimers.set(id, timerId);
};

export const useUIStore = create<UIState>()(
  devtools(
    persist(
      subscribeWithSelector(
        immer((set, get) => ({
          errors: [],
          maxHistorySize: 100,
          toasts: [],
          maxToasts: 5,

          drafts: new Map(),
          attachments: [],
          isRecording: false,
          recordingStartTime: null,
          voiceRecordings: [],
          contextMetadata: {
            workspacePath: undefined,
            selectedFilesCount: 0,
            openEditorsCount: 0,
          },
          inputHeight: 72,
          showMarkdownPreview: false,

          sidecarOpen: false,
          sidecarSection: 'operations',
          sidecarWidth: 400,
          sidecarUserSelected: false,
          sidebarWidth: 260,
          sidebarCollapsed: false,
          sidecar: {
            isOpen: false,
            activeMode: 'code',
            contextId: null,
            autoTrigger: false,
          },

          mode: 'simple',
          onboardingCompleted: false,
          showModeSwitcherHint: true,

          addError: (errorData) => {
            const { errors, toasts, maxHistorySize, maxToasts } = get();

            const now = Date.now();
            const existingError = errors.find(
              (e) =>
                e.type === errorData.type &&
                e.message === errorData.message &&
                !e.dismissed &&
                now - e.timestamp < 5000,
            );

            if (existingError) {
              set(
                (state) => {
                  state.errors = state.errors.map((e) =>
                    e.id === existingError.id ? { ...e, count: e.count + 1, timestamp: now } : e,
                  );
                  state.toasts = state.toasts.map((e) =>
                    e.id === existingError.id ? { ...e, count: e.count + 1, timestamp: now } : e,
                  );
                },
                undefined,
                'ui/error/increment',
              );
              return;
            }

            const newError: AppError = {
              ...errorData,
              id: `error_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
              timestamp: now,
              dismissed: false,
              count: 1,
            };

            const newErrors = [newError, ...errors].slice(0, maxHistorySize);
            const newToasts = [newError, ...toasts].slice(0, maxToasts);

            set({ errors: newErrors, toasts: newToasts }, undefined, 'ui/error/add');

            if (errorData.severity === 'info' || errorData.severity === 'warning') {
              const duration = errorData.severity === 'info' ? 3000 : 5000;
              const timerId = setTimeout(() => {
                get().dismissError(newError.id);
              }, duration);
              setDismissTimer(newError.id, timerId);
            }

            if (errorData.severity === 'critical') {
              void get().reportError(newError.id);
            }

            if (import.meta.env.DEV) {
              const consoleMethod =
                errorData.severity === 'critical' || errorData.severity === 'error'
                  ? console.error
                  : errorData.severity === 'warning'
                    ? console.warn
                    : console.debug;

              consoleMethod(`[${errorData.severity.toUpperCase()}] ${errorData.message}`, {
                type: errorData.type,
                details: errorData.details,
                context: errorData.context,
                stack: errorData.stack,
              });
            }
          },

          dismissError: (id) => {
            clearDismissTimer(id);

            set(
              (state) => {
                state.errors = state.errors.map((e) =>
                  e.id === id ? { ...e, dismissed: true } : e,
                );
                state.toasts = state.toasts.filter((e) => e.id !== id);
              },
              undefined,
              'ui/error/dismiss',
            );
          },

          dismissAll: () => {
            clearAllDismissTimers();

            set(
              (state) => {
                state.errors = state.errors.map((e) => ({ ...e, dismissed: true }));
                state.toasts = [];
              },
              undefined,
              'ui/error/dismissAll',
            );
          },

          clearHistory: () => {
            clearAllDismissTimers();

            set({ errors: [], toasts: [] }, undefined, 'ui/error/clearHistory');
          },

          getStatistics: () => {
            const { errors } = get();

            const stats: ErrorStatistics = {
              totalErrors: errors.length,
              errorsByType: {},
              errorsBySeverity: {
                info: 0,
                warning: 0,
                error: 0,
                critical: 0,
              },
              recentErrors: errors.slice(0, 10),
            };

            errors.forEach((error) => {
              stats.errorsByType[error.type] = (stats.errorsByType[error.type] || 0) + error.count;
              stats.errorsBySeverity[error.severity] += error.count;
            });

            return stats;
          },

          exportLogs: async () => {
            const { errors } = get();

            const logs = errors.map((error) => ({
              id: error.id,
              type: error.type,
              severity: error.severity,
              message: error.message,
              details: error.details,
              timestamp: new Date(error.timestamp).toISOString(),
              context: error.context,
              count: error.count,
            }));

            return JSON.stringify(logs, null, 2);
          },

          reportError: async (errorId) => {
            const { errors } = get();
            const error = errors.find((e) => e.id === errorId);

            if (!error) {
              console.warn('Error not found for reporting:', errorId);
              return;
            }

            try {
              await invoke('error_report', {
                errorData: {
                  errorType: error.type,
                  message: error.message,
                  stackTrace: error.stack,
                  context: error.context || {},
                  timestamp: error.timestamp,
                },
              });
            } catch (err) {
              console.error('Failed to report error to backend:', err);
            }
          },

          setDraft: (conversationId, content) => {
            set(
              (state) => {
                state.drafts.set(conversationId, {
                  conversationId,
                  content,
                  timestamp: new Date(),
                });
              },
              undefined,
              'ui/input/setDraft',
            );
          },

          getDraft: (conversationId) => {
            const drafts = get().drafts;
            return drafts.get(conversationId)?.content ?? '';
          },

          clearDraft: (conversationId) => {
            set(
              (state) => {
                state.drafts.delete(conversationId);
              },
              undefined,
              'ui/input/clearDraft',
            );
          },

          addAttachment: (file) => {
            const id = generateId();
            const attachment: FileAttachment = {
              id,
              file,
              size: file.size,
              type: file.type,
              name: file.name,
            };

            if (file.type.startsWith('image/')) {
              attachment.previewUrl = URL.createObjectURL(file);
            }

            set(
              (state) => {
                state.attachments.push(attachment);
              },
              undefined,
              'ui/input/addAttachment',
            );

            return id;
          },

          removeAttachment: (id) => {
            set(
              (state) => {
                const attachment = state.attachments.find((a) => a.id === id);
                if (attachment?.previewUrl) {
                  URL.revokeObjectURL(attachment.previewUrl);
                }
                state.attachments = state.attachments.filter((a) => a.id !== id);
              },
              undefined,
              'ui/input/removeAttachment',
            );
          },

          clearAttachments: () => {
            set(
              (state) => {
                state.attachments.forEach((attachment) => {
                  if (attachment.previewUrl) {
                    URL.revokeObjectURL(attachment.previewUrl);
                  }
                });
                state.attachments = [];
              },
              undefined,
              'ui/input/clearAttachments',
            );
          },

          startRecording: () => {
            set(
              (state) => {
                state.isRecording = true;
                state.recordingStartTime = new Date();
              },
              undefined,
              'ui/input/startRecording',
            );
          },

          stopRecording: (blob, duration) => {
            const id = generateId();
            set(
              (state) => {
                state.isRecording = false;
                state.recordingStartTime = null;
                state.voiceRecordings.push({
                  id,
                  blob,
                  duration,
                  timestamp: new Date(),
                });
              },
              undefined,
              'ui/input/stopRecording',
            );
          },

          removeRecording: (id) => {
            set(
              (state) => {
                state.voiceRecordings = state.voiceRecordings.filter((r) => r.id !== id);
              },
              undefined,
              'ui/input/removeRecording',
            );
          },

          updateContextMetadata: (metadata) => {
            set(
              (state) => {
                state.contextMetadata = {
                  ...state.contextMetadata,
                  ...metadata,
                };
              },
              undefined,
              'ui/input/updateContextMetadata',
            );
          },

          setInputHeight: (height) => {
            set({ inputHeight: height }, undefined, 'ui/input/setInputHeight');
          },

          toggleMarkdownPreview: () => {
            set(
              (state) => {
                state.showMarkdownPreview = !state.showMarkdownPreview;
              },
              undefined,
              'ui/input/toggleMarkdownPreview',
            );
          },

          resetInput: () => {
            const attachments = get().attachments;
            attachments.forEach((attachment) => {
              if (attachment.previewUrl) {
                URL.revokeObjectURL(attachment.previewUrl);
              }
            });

            set(
              {
                drafts: new Map(),
                attachments: [],
                isRecording: false,
                recordingStartTime: null,
                voiceRecordings: [],
                contextMetadata: {
                  workspacePath: undefined,
                  selectedFilesCount: 0,
                  openEditorsCount: 0,
                },
                inputHeight: 72,
                showMarkdownPreview: false,
              },
              undefined,
              'ui/input/reset',
            );
          },

          setSidecarOpen: (open) =>
            set(
              (state) => {
                state.sidecarOpen = open;
                if (!open) {
                  state.sidecarUserSelected = false;
                }
              },
              undefined,
              'ui/sidecar/setOpen',
            ),

          setSidecarSection: (section) =>
            set(
              (state) => {
                state.sidecarSection = section;
                state.sidecarUserSelected = true;
              },
              undefined,
              'ui/sidecar/setSection',
            ),

          setSidecarSectionFromEvent: (eventType) =>
            set(
              (state) => {
                if (state.sidecarUserSelected) return;
                if (!state.sidecarOpen && !state.sidecar.isOpen) return;
                const lowered = eventType.toLowerCase();
                let target: SidecarSection | null = null;
                if (lowered.includes('terminal') || lowered.includes('execute')) {
                  target = 'terminal';
                } else if (
                  lowered.includes('read_file') ||
                  lowered.includes('edit_file') ||
                  lowered.includes('file')
                ) {
                  target = 'files';
                } else if (lowered.includes('approval')) {
                  target = 'approvals';
                } else if (lowered.includes('browser')) {
                  target = 'browser';
                } else if (
                  lowered.includes('generate_image') ||
                  lowered.includes('generate_video') ||
                  lowered.includes('media')
                ) {
                  target = 'media';
                } else if (lowered.includes('calendar')) {
                  target = 'tasks';
                } else if (lowered.includes('automation') || lowered.includes('recording')) {
                  target = 'tools';
                } else if (lowered.includes('cloud')) {
                  target = 'files';
                } else if (
                  lowered.includes('gmail') ||
                  lowered.includes('email') ||
                  lowered.includes('inbox')
                ) {
                  target = 'tasks';
                } else if (lowered.includes('mcp')) {
                  target = 'tools';
                }
                if (!target) return;
                state.sidecarSection = target;
              },
              undefined,
              'ui/sidecar/setSectionFromEvent',
            ),

          setSidecarWidth: (width) =>
            set(
              (state) => {
                state.sidecarWidth = width;
              },
              undefined,
              'ui/sidecar/setWidth',
            ),

          setSidebarWidth: (width) =>
            set(
              (state) => {
                state.sidebarWidth = width;
              },
              undefined,
              'ui/sidebar/setWidth',
            ),

          setSidebarCollapsed: (collapsed) =>
            set(
              (state) => {
                state.sidebarCollapsed = collapsed;
              },
              undefined,
              'ui/sidebar/setCollapsed',
            ),

          setSidecar: (updates) =>
            set(
              (state) => {
                state.sidecar = { ...state.sidecar, ...updates };
              },
              undefined,
              'ui/sidecar/update',
            ),

          openSidecar: (mode, contextId, context) =>
            set(
              (state) => {
                state.sidecar.isOpen = true;
                state.sidecar.activeMode = mode;
                state.sidecar.contextId = contextId ?? null;
                state.sidecar.context = context;
                state.sidecarOpen = true;
              },
              undefined,
              'ui/sidecar/open',
            ),

          closeSidecar: () =>
            set(
              (state) => {
                state.sidecar.isOpen = false;
                state.sidecarOpen = false;
              },
              undefined,
              'ui/sidecar/close',
            ),

          getSuggestedSidecarMode: (message) => {
            const content = message.content.toLowerCase();

            const codeBlockMatches = message.content.match(/```[\s\S]+?```/g);
            if (
              codeBlockMatches &&
              codeBlockMatches.some((block) => {
                const lines = block.split('\n').length;
                return lines > 15;
              })
            ) {
              return 'code';
            }

            if (
              content.includes('.csv') ||
              content.includes('id,name,value') ||
              content.includes('```csv')
            ) {
              return 'data';
            }

            if (
              content.includes('http://') ||
              content.includes('https://') ||
              message.operations?.some(
                (op) =>
                  op.type === 'tool' &&
                  typeof op.data === 'object' &&
                  op.data !== null &&
                  typeof (op.data as { toolName?: string }).toolName === 'string' &&
                  (op.data as { toolName: string }).toolName.includes('browser'),
              )
            ) {
              return 'browser';
            }

            if (message.operations?.some((op) => op.type === 'terminal')) {
              return 'terminal';
            }

            if (content.includes('diff') || (content.includes('---') && content.includes('+++'))) {
              return 'diff';
            }

            if (codeBlockMatches || content.includes('```')) {
              return 'preview';
            }

            return null;
          },

          setMode: (mode) => set({ mode }, undefined, 'ui/mode/set'),

          toggleMode: () => {
            const currentMode = get().mode;
            const newMode = currentMode === 'simple' ? 'advanced' : 'simple';

            set(
              {
                mode: newMode,
                showModeSwitcherHint: false,
              },
              undefined,
              'ui/mode/toggle',
            );
          },

          completeOnboarding: () =>
            set({ onboardingCompleted: true }, undefined, 'ui/onboarding/complete'),

          dismissModeSwitcherHint: () =>
            set({ showModeSwitcherHint: false }, undefined, 'ui/mode/dismissHint'),

          isSimpleMode: () => get().mode === 'simple',

          isAdvancedMode: () => get().mode === 'advanced',

          resetOnLogout: () => {
            clearAllDismissTimers();

            const attachments = get().attachments;
            attachments.forEach((attachment) => {
              if (attachment.previewUrl) {
                URL.revokeObjectURL(attachment.previewUrl);
              }
            });

            set(
              (state) => {
                state.errors = [];
                state.toasts = [];

                state.drafts = new Map();
                state.attachments = [];
                state.isRecording = false;
                state.recordingStartTime = null;
                state.voiceRecordings = [];
                state.contextMetadata = {
                  workspacePath: undefined,
                  selectedFilesCount: 0,
                  openEditorsCount: 0,
                };
                state.inputHeight = 72;
                state.showMarkdownPreview = false;

                state.sidecarOpen = false;
                state.sidecarSection = 'operations';
                state.sidecarUserSelected = false;
                state.sidecar = {
                  isOpen: false,
                  activeMode: 'code',
                  contextId: null,
                  autoTrigger: false,
                };

                // Note: mode, onboardingCompleted, showModeSwitcherHint are kept
                // as they represent user preference, not session state
              },
              undefined,
              'ui/resetOnLogout',
            );
          },
        })),
      ),
      {
        name: 'agiworkforce-ui',
        version: STORAGE_VERSION,
        storage: createJSONStorage(() =>
          typeof window === 'undefined' ? storageFallback : window.localStorage,
        ),
        partialize: (state) => ({
          sidebarWidth: state.sidebarWidth,
          sidebarCollapsed: state.sidebarCollapsed,
          sidecar: state.sidecar,

          mode: state.mode,
          onboardingCompleted: state.onboardingCompleted,
          showModeSwitcherHint: state.showModeSwitcherHint,
        }),
        merge: (persistedState: unknown, currentState) => {
          const persisted = persistedState as Partial<{
            sidebarWidth: number;
            sidebarCollapsed: boolean;
            sidecar: SidecarState;
            mode: UIMode;
            onboardingCompleted: boolean;
            showModeSwitcherHint: boolean;
          }>;

          return {
            ...currentState,
            sidebarWidth: persisted?.sidebarWidth ?? currentState.sidebarWidth,
            sidebarCollapsed: persisted?.sidebarCollapsed ?? currentState.sidebarCollapsed,
            sidecar: persisted?.sidecar
              ? {
                  ...currentState.sidecar,
                  ...persisted.sidecar,
                  autoTrigger: false,
                }
              : currentState.sidecar,
            mode: persisted?.mode ?? currentState.mode,
            onboardingCompleted: persisted?.onboardingCompleted ?? currentState.onboardingCompleted,
            showModeSwitcherHint:
              persisted?.showModeSwitcherHint ?? currentState.showModeSwitcherHint,
          };
        },
      },
    ),
    { name: 'UIStore', enabled: import.meta.env.DEV },
  ),
);

export const selectErrors = (state: UIState) => state.errors;
export const selectToasts = (state: UIState) => state.toasts;
export const selectUndismissedErrors = (state: UIState) => state.errors.filter((e) => !e.dismissed);

export const selectDraft = (conversationId: number | null) => (state: UIState) =>
  state.drafts.get(conversationId)?.content ?? '';
export const selectAttachments = (state: UIState) => state.attachments;
export const selectAttachmentCount = (state: UIState) => state.attachments.length;
export const selectIsRecording = (state: UIState) => state.isRecording;
export const selectVoiceRecordings = (state: UIState) => state.voiceRecordings;
export const selectContextMetadata = (state: UIState) => state.contextMetadata;
export const selectInputHeight = (state: UIState) => state.inputHeight;
export const selectShowMarkdownPreview = (state: UIState) => state.showMarkdownPreview;

export const selectSidecarOpen = (state: UIState) => state.sidecarOpen;
export const selectSidecarSection = (state: UIState) => state.sidecarSection;
export const selectSidecarWidth = (state: UIState) => state.sidecarWidth;
export const selectSidecarUserSelected = (state: UIState) => state.sidecarUserSelected;
export const selectSidebarWidth = (state: UIState) => state.sidebarWidth;
export const selectSidebarCollapsed = (state: UIState) => state.sidebarCollapsed;
export const selectSidecar = (state: UIState) => state.sidecar;
export const selectIsSidecarVisible = (state: UIState) => state.sidecarOpen || state.sidecar.isOpen;
export const selectActiveSidecarMode = (state: UIState) => state.sidecar.activeMode;

export const selectIsSimpleMode = (state: UIState) => state.mode === 'simple';
export const selectUIMode = (state: UIState) => state.mode;
export const selectOnboardingCompleted = (state: UIState) => state.onboardingCompleted;
export const selectShowModeSwitcherHint = (state: UIState) => state.showModeSwitcherHint;

/**
 * @deprecated Use useUIStore instead. This alias is for backwards compatibility.
 */
export const useErrorStore = useUIStore;

/**
 * @deprecated Use useUIStore instead. This alias is for backwards compatibility.
 */
export const useInputStore = useUIStore;

/**
 * @deprecated Use useUIStore instead. This alias is for backwards compatibility.
 */
export const useSidecarStore = useUIStore;

/**
 * @deprecated Use useUIStore instead. This alias is for backwards compatibility.
 */
export const useSimpleModeStore = useUIStore;

export type { UIState };

export default useUIStore;
