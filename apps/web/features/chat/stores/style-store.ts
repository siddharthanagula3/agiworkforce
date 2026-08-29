import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  fetchPreferenceNamespace,
  savePreferenceNamespace,
} from '@/app/settings/_lib/preferences-client';

export type PresetStyle = 'default' | 'concise' | 'detailed' | 'technical' | 'creative';

export const DEFAULT_PRESET_STYLE: PresetStyle = 'concise';
export type ResponseStyle = PresetStyle | 'custom';

export type ResponseLength = 'brief' | 'standard' | 'thorough';

export interface CustomStyle {
  id: string;
  name: string;
  instruction: string;
  sampleText: string;
  createdAt: string;
}

interface StyleState {
  style: ResponseStyle;
  length: ResponseLength;
  activeCustomStyleId: string | null;
  customStyles: CustomStyle[];
  setStyle: (style: ResponseStyle) => void;
  setLength: (length: ResponseLength) => void;
  setActiveCustomStyle: (id: string | null) => void;
  addCustomStyle: (name: string, instruction: string, sampleText: string) => string;
  updateCustomStyle: (
    id: string,
    updates: Partial<Pick<CustomStyle, 'name' | 'instruction' | 'sampleText'>>,
  ) => void;
  deleteCustomStyle: (id: string) => void;
  hydrateFromServer: () => Promise<void>;
}

export const RESPONSE_STYLE_PREFERENCES_NAMESPACE = 'response-style';

interface StylePreferencesPayload {
  style: ResponseStyle;
  length: ResponseLength;
  activeCustomStyleId: string | null;
  customStyles: CustomStyle[];
}

export const useStyleStore = create<StyleState>()(
  persist(
    (set) => ({
      style: DEFAULT_PRESET_STYLE,
      length: 'brief' as ResponseLength,
      activeCustomStyleId: null,
      customStyles: [],

      setStyle: (style) => {
        set({ style, activeCustomStyleId: style === 'custom' ? null : null });
        void syncToServer();
      },

      setLength: (length) => {
        set({ length });
        void syncToServer();
      },

      setActiveCustomStyle: (id) => {
        set({ style: 'custom', activeCustomStyleId: id });
        void syncToServer();
      },

      addCustomStyle: (name, instruction, sampleText) => {
        const id = crypto.randomUUID();
        set((state) => ({
          customStyles: [
            ...state.customStyles,
            { id, name, instruction, sampleText, createdAt: new Date().toISOString() },
          ],
          style: 'custom' as ResponseStyle,
          activeCustomStyleId: id,
        }));
        void syncToServer();
        return id;
      },

      updateCustomStyle: (id, updates) => {
        set((state) => ({
          customStyles: state.customStyles.map((s) => (s.id === id ? { ...s, ...updates } : s)),
        }));
        void syncToServer();
      },

      deleteCustomStyle: (id) => {
        set((state) => ({
          customStyles: state.customStyles.filter((s) => s.id !== id),
          activeCustomStyleId: state.activeCustomStyleId === id ? null : state.activeCustomStyleId,
          style: state.activeCustomStyleId === id ? DEFAULT_PRESET_STYLE : state.style,
        }));
        void syncToServer();
      },

      hydrateFromServer: async () => {
        try {
          const state = useStyleStore.getState();
          const stored = await fetchPreferenceNamespace<StylePreferencesPayload>(
            RESPONSE_STYLE_PREFERENCES_NAMESPACE,
            {
              style: state.style,
              length: state.length,
              activeCustomStyleId: state.activeCustomStyleId,
              customStyles: state.customStyles,
            },
          );
          set({
            style: stored.style,
            length: stored.length,
            activeCustomStyleId: stored.activeCustomStyleId,
            customStyles: stored.customStyles ?? [],
          });
        } catch {
          // Offline or unauthenticated: the localStorage cache is still valid.
        }
      },
    }),
    {
      name: 'agi-response-style',
      version: 4,
      storage: createJSONStorage(() => localStorage),
      migrate: (persisted: unknown, version: number) => {
        const old = (persisted ?? {}) as Record<string, unknown>;
        if (version < 3) {
          return {
            ...old,
            activeCustomStyleId: null,
            customStyles: [],
            length: 'brief' as ResponseLength,
          };
        }
        if (version < 4) {
          return { ...old, length: 'brief' as ResponseLength };
        }
        return persisted as StyleState;
      },
    },
  ),
);

let syncTimer: ReturnType<typeof setTimeout> | null = null;
function syncToServer(): void {
  if (typeof window === 'undefined') return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    const { style, length, activeCustomStyleId, customStyles } = useStyleStore.getState();
    void savePreferenceNamespace<StylePreferencesPayload>(RESPONSE_STYLE_PREFERENCES_NAMESPACE, {
      style,
      length,
      activeCustomStyleId,
      customStyles,
    }).catch(() => {
      // Keep the local value; the next mutation retries.
    });
  }, 600);
}

const STYLE_INSTRUCTIONS: Record<PresetStyle, string> = {
  default:
    'Answer directly. Do not restate the question, open with filler, or close with a summary of what you just said. Use prose by default and lists only when the content is genuinely a list.',
  concise: 'Be brief and direct. Use short sentences. Avoid unnecessary detail.',
  detailed: 'Provide thorough, comprehensive responses with examples and context.',
  technical: 'Use precise technical language. Include code examples where relevant.',
  creative: 'Be expressive and engaging. Use analogies and vivid descriptions.',
};

const LENGTH_INSTRUCTIONS: Record<ResponseLength, string> = {
  brief:
    'Keep the response as short as the question allows. A one-line question gets a one-line answer. Expand only when the user asks for more.',
  standard: 'Match the response length to the complexity of the question; never pad.',
  thorough:
    'Cover the topic completely: include background, edge cases, and worked examples even when not explicitly requested.',
};

export const RESPONSE_LENGTH_OPTIONS: ReadonlyArray<{
  id: ResponseLength;
  label: string;
  desc: string;
}> = [
  { id: 'brief', label: 'Brief', desc: 'Shortest answer that works' },
  { id: 'standard', label: 'Standard', desc: 'Length follows the question' },
  { id: 'thorough', label: 'Thorough', desc: 'Full background and examples' },
];

export function getStyleInstruction(
  style: ResponseStyle,
  customStyleId?: string | null,
  length?: ResponseLength,
): string {
  const store = useStyleStore.getState();
  const styleText =
    style === 'custom'
      ? (store.customStyles.find((s) => s.id === (customStyleId ?? store.activeCustomStyleId))
          ?.instruction ?? '')
      : (STYLE_INSTRUCTIONS[style] ?? '');
  const lengthText = LENGTH_INSTRUCTIONS[length ?? store.length] ?? '';
  return [styleText, lengthText].filter(Boolean).join(' ');
}
