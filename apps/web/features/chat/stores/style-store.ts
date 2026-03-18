import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type PresetStyle = 'default' | 'concise' | 'detailed' | 'technical' | 'creative';
export type ResponseStyle = PresetStyle | 'custom';

export interface CustomStyle {
  id: string;
  name: string;
  instruction: string;
  sampleText: string;
  createdAt: string;
}

interface StyleState {
  style: ResponseStyle;
  activeCustomStyleId: string | null;
  customStyles: CustomStyle[];
  setStyle: (style: ResponseStyle) => void;
  setActiveCustomStyle: (id: string | null) => void;
  addCustomStyle: (name: string, instruction: string, sampleText: string) => string;
  updateCustomStyle: (
    id: string,
    updates: Partial<Pick<CustomStyle, 'name' | 'instruction' | 'sampleText'>>,
  ) => void;
  deleteCustomStyle: (id: string) => void;
}

export const useStyleStore = create<StyleState>()(
  persist(
    (set) => ({
      style: 'default',
      activeCustomStyleId: null,
      customStyles: [],

      setStyle: (style) => set({ style, activeCustomStyleId: style === 'custom' ? null : null }),

      setActiveCustomStyle: (id) => set({ style: 'custom', activeCustomStyleId: id }),

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
        return id;
      },

      updateCustomStyle: (id, updates) =>
        set((state) => ({
          customStyles: state.customStyles.map((s) => (s.id === id ? { ...s, ...updates } : s)),
        })),

      deleteCustomStyle: (id) =>
        set((state) => ({
          customStyles: state.customStyles.filter((s) => s.id !== id),
          activeCustomStyleId: state.activeCustomStyleId === id ? null : state.activeCustomStyleId,
          style: state.activeCustomStyleId === id ? 'default' : state.style,
        })),
    }),
    {
      name: 'agi-response-style',
      version: 3,
      storage: createJSONStorage(() => localStorage),
      migrate: (persisted: unknown, version: number) => {
        if (version < 3) {
          const old = persisted as Record<string, unknown>;
          return {
            ...old,
            activeCustomStyleId: null,
            customStyles: [],
          };
        }
        return persisted as StyleState;
      },
    },
  ),
);

/** Maps each preset style to its system prompt modifier string. */
const STYLE_INSTRUCTIONS: Record<PresetStyle, string> = {
  default: '',
  concise: 'Be brief and direct. Use short sentences. Avoid unnecessary detail.',
  detailed: 'Provide thorough, comprehensive responses with examples and context.',
  technical: 'Use precise technical language. Include code examples where relevant.',
  creative: 'Be expressive and engaging. Use analogies and vivid descriptions.',
};

/**
 * Returns the system prompt modifier for the selected style.
 * For custom styles, looks up the active custom style's instruction.
 */
export function getStyleInstruction(style: ResponseStyle, customStyleId?: string | null): string {
  if (style === 'custom') {
    const store = useStyleStore.getState();
    const custom = store.customStyles.find(
      (s) => s.id === (customStyleId ?? store.activeCustomStyleId),
    );
    return custom?.instruction || '';
  }
  return STYLE_INSTRUCTIONS[style] || '';
}
