import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type ResponseStyle = 'normal' | 'formal' | 'concise' | 'explanatory' | 'custom';

interface StyleState {
  style: ResponseStyle;
  customInstruction: string;
  setStyle: (style: ResponseStyle) => void;
  setCustomInstruction: (instruction: string) => void;
}

export const useStyleStore = create<StyleState>()(
  persist(
    (set) => ({
      style: 'normal',
      customInstruction: '',
      setStyle: (style) => set({ style }),
      setCustomInstruction: (instruction) => set({ customInstruction: instruction }),
    }),
    {
      name: 'agi-response-style',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/**
 * Returns a system message prefix for the selected style.
 * Returns empty string for 'normal' (no modification).
 */
export function getStyleInstruction(style: ResponseStyle, customInstruction: string): string {
  switch (style) {
    case 'formal':
      return 'Respond in a formal, professional tone. Use precise language and structured formatting.';
    case 'concise':
      return 'Be concise and direct. Use short sentences. Avoid unnecessary elaboration.';
    case 'explanatory':
      return 'Explain concepts thoroughly with examples. Break down complex ideas step by step.';
    case 'custom':
      return customInstruction.trim();
    case 'normal':
    default:
      return '';
  }
}
