import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * AUDIT-FIX CMP-6/CMP-7: the ONE response-style vocabulary for the web chat
 * surface.
 *
 * Three incompatible vocabularies used to coexist: the composer "+" menu's
 * `StyleMode` (normal|concise|formal|explanatory), this store's `PresetStyle`,
 * and unified-chat's `WritingStyle`. Both web controls rendered at once for
 * paid users, each drawing its own checkmark, and in `handleSubmit` the
 * resolved `styleInstruction` won while `styleMode` was silently dropped -- so
 * the "+" menu selection did nothing. The "+" menu flyout now reads and writes
 * THIS store, so the two surfaces are two views of one value and can never
 * disagree.
 */
export type PresetStyle = 'default' | 'concise' | 'detailed' | 'technical' | 'creative';
export type ResponseStyle = PresetStyle | 'custom';

/**
 * AUDIT-FIX CMP-6/CMP-7: the verbosity axis, which did not exist anywhere in
 * the repo (`rg verbosity|responseLength` returned nothing) -- the reported
 * "verbose output is common" had no control that could address it. This is
 * orthogonal to `ResponseStyle`: style says HOW to write, length says HOW MUCH.
 */
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
  /** Verbosity axis (AUDIT-FIX CMP-6/CMP-7). Defaults to 'brief'. */
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
}

export const useStyleStore = create<StyleState>()(
  persist(
    (set) => ({
      style: 'default',
      // AUDIT-FIX CMP-6/CMP-7: 'brief' is the shipped default, so a fresh
      // account gets real length guidance on turn 1 instead of the previous
      // no-op empty instruction. Users who want the old behaviour pick
      // 'standard'/'thorough'; the control is one click away in both the
      // footer StyleSelector and the composer "+" menu.
      length: 'brief' as ResponseLength,
      activeCustomStyleId: null,
      customStyles: [],

      setStyle: (style) => set({ style, activeCustomStyleId: style === 'custom' ? null : null }),

      setLength: (length) => set({ length }),

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
        // AUDIT-FIX CMP-6/CMP-7: existing installs gain the length axis.
        if (version < 4) {
          return { ...old, length: 'brief' as ResponseLength };
        }
        return persisted as StyleState;
      },
    },
  ),
);

/**
 * Maps each preset style to its system prompt modifier string.
 *
 * AUDIT-FIX CMP-6/CMP-7: `default` is no longer the empty string. Every one of
 * the three old style vocabularies bottomed out in a no-op instruction, so out
 * of the box ZERO style guidance reached the model -- which is the reported
 * "verbose output is common". `default` now carries a real baseline.
 */
const STYLE_INSTRUCTIONS: Record<PresetStyle, string> = {
  default:
    'Answer directly. Do not restate the question, open with filler, or close with a summary of what you just said. Use prose by default and lists only when the content is genuinely a list.',
  concise: 'Be brief and direct. Use short sentences. Avoid unnecessary detail.',
  detailed: 'Provide thorough, comprehensive responses with examples and context.',
  technical: 'Use precise technical language. Include code examples where relevant.',
  creative: 'Be expressive and engaging. Use analogies and vivid descriptions.',
};

/** Maps the verbosity axis to its system prompt modifier (AUDIT-FIX CMP-6/CMP-7). */
const LENGTH_INSTRUCTIONS: Record<ResponseLength, string> = {
  brief:
    'Keep the response as short as the question allows. A one-line question gets a one-line answer. Expand only when the user asks for more.',
  standard: 'Match the response length to the complexity of the question; never pad.',
  thorough:
    'Cover the topic completely: include background, edge cases, and worked examples even when not explicitly requested.',
};

/** Display metadata for the verbosity axis, shared by every control that renders it. */
export const RESPONSE_LENGTH_OPTIONS: ReadonlyArray<{
  id: ResponseLength;
  label: string;
  desc: string;
}> = [
  { id: 'brief', label: 'Brief', desc: 'Shortest answer that works' },
  { id: 'standard', label: 'Standard', desc: 'Length follows the question' },
  { id: 'thorough', label: 'Thorough', desc: 'Full background and examples' },
];

/**
 * Returns the system prompt modifier for the selected style AND length.
 *
 * AUDIT-FIX CMP-6/CMP-7: composes both axes into the single instruction the
 * send path forwards, so there is exactly one string carrying style guidance
 * and no second, silently-dropped hint. `length` defaults to the store's
 * current value, so callers that only know the style still get the length axis.
 */
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
