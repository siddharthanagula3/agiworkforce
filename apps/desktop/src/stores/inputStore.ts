import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

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

interface InputState {
  // Draft messages per conversation
  drafts: Map<number | null, DraftMessage>;

  // Attachments (not persisted - session only)
  attachments: FileAttachment[];

  // Voice recording state
  isRecording: boolean;
  recordingStartTime: Date | null;
  voiceRecordings: VoiceRecording[];

  // Context metadata
  contextMetadata: ContextMetadata;

  // UI state
  inputHeight: number;
  showMarkdownPreview: boolean;

  // Actions
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

  reset: () => void;
}

const MAX_DRAFT_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Helper to generate unique IDs
const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

// Helper to clean up old drafts
const cleanOldDrafts = (drafts: Map<number | null, DraftMessage>) => {
  const now = Date.now();
  const cleaned = new Map(drafts);

  for (const [key, draft] of cleaned.entries()) {
    if (now - draft.timestamp.getTime() > MAX_DRAFT_AGE_MS) {
      cleaned.delete(key);
    }
  }

  return cleaned;
};

export const useInputStore = create<InputState>()(
  persist(
    immer((set, get) => ({
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
      inputHeight: 72, // Default height for 3 lines
      showMarkdownPreview: false,

      setDraft: (conversationId, content) => {
        set((state) => {
          state.drafts.set(conversationId, {
            conversationId,
            content,
            timestamp: new Date(),
          });
        });
      },

      getDraft: (conversationId) => {
        const drafts = get().drafts;
        return drafts.get(conversationId)?.content ?? '';
      },

      clearDraft: (conversationId) => {
        set((state) => {
          state.drafts.delete(conversationId);
        });
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

        // Create preview URL for images
        if (file.type.startsWith('image/')) {
          attachment.previewUrl = URL.createObjectURL(file);
        }

        set((state) => {
          state.attachments.push(attachment);
        });

        return id;
      },

      removeAttachment: (id) => {
        set((state) => {
          const attachment = state.attachments.find((a) => a.id === id);
          if (attachment?.previewUrl) {
            URL.revokeObjectURL(attachment.previewUrl);
          }
          state.attachments = state.attachments.filter((a) => a.id !== id);
        });
      },

      clearAttachments: () => {
        set((state) => {
          // Clean up preview URLs
          state.attachments.forEach((attachment) => {
            if (attachment.previewUrl) {
              URL.revokeObjectURL(attachment.previewUrl);
            }
          });
          state.attachments = [];
        });
      },

      startRecording: () => {
        set((state) => {
          state.isRecording = true;
          state.recordingStartTime = new Date();
        });
      },

      stopRecording: (blob, duration) => {
        const id = generateId();
        set((state) => {
          state.isRecording = false;
          state.recordingStartTime = null;
          state.voiceRecordings.push({
            id,
            blob,
            duration,
            timestamp: new Date(),
          });
        });
      },

      removeRecording: (id) => {
        set((state) => {
          state.voiceRecordings = state.voiceRecordings.filter((r) => r.id !== id);
        });
      },

      updateContextMetadata: (metadata) => {
        set((state) => {
          state.contextMetadata = {
            ...state.contextMetadata,
            ...metadata,
          };
        });
      },

      setInputHeight: (height) => {
        set({ inputHeight: height });
      },

      toggleMarkdownPreview: () => {
        set((state) => {
          state.showMarkdownPreview = !state.showMarkdownPreview;
        });
      },

      reset: () => {
        // Clean up preview URLs
        const attachments = get().attachments;
        attachments.forEach((attachment) => {
          if (attachment.previewUrl) {
            URL.revokeObjectURL(attachment.previewUrl);
          }
        });

        set({
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
        });
      },
    })),
    {
      name: 'agiworkforce-input',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Only persist drafts and UI preferences
        drafts: Array.from(state.drafts.entries()),
        inputHeight: state.inputHeight,
        showMarkdownPreview: state.showMarkdownPreview,
      }),
      merge: (persistedState: any, currentState) => {
        // Restore drafts from array to Map
        const drafts = new Map(persistedState?.drafts || []);
        const cleanedDrafts = cleanOldDrafts(drafts);

        return {
          ...currentState,
          drafts: cleanedDrafts,
          inputHeight: persistedState?.inputHeight ?? currentState.inputHeight,
          showMarkdownPreview:
            persistedState?.showMarkdownPreview ?? currentState.showMarkdownPreview,
        };
      },
    },
  ),
);

// Selectors for optimized subscriptions
export const selectDraft = (conversationId: number | null) => (state: InputState) =>
  state.drafts.get(conversationId)?.content ?? '';

export const selectAttachments = (state: InputState) => state.attachments;
export const selectAttachmentCount = (state: InputState) => state.attachments.length;
export const selectIsRecording = (state: InputState) => state.isRecording;
export const selectVoiceRecordings = (state: InputState) => state.voiceRecordings;
export const selectContextMetadata = (state: InputState) => state.contextMetadata;
export const selectInputHeight = (state: InputState) => state.inputHeight;
export const selectShowMarkdownPreview = (state: InputState) => state.showMarkdownPreview;
