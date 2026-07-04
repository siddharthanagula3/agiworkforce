/**
 * Shared source of truth for Personalization screen options. Read by the
 * screen component and by the system-prompt renderer
 * (src/features/memory/services/personalization.ts) so the two never drift.
 */
import type { PersonalizationStyle } from '@/stores/settingsStore';

export interface StyleOption {
  value: PersonalizationStyle;
  label: string;
  description: string;
}

/** Base response style/tone presets, applied before the granular dials below. */
export const PERSONALIZATION_STYLES: StyleOption[] = [
  { value: 'default', label: 'Default', description: 'Balanced, adaptive tone' },
  { value: 'concise', label: 'Concise', description: 'Short, to the point' },
  { value: 'explanatory', label: 'Explanatory', description: 'More detail and context' },
  { value: 'formal', label: 'Formal', description: 'Professional, precise language' },
];

export interface StyleSliderConfig {
  key: 'warmth' | 'enthusiasm' | 'headersLists' | 'emoji';
  label: string;
  leftLabel: string;
  rightLabel: string;
}

/** Granular response-style dials, each 0-100 with Less/Default/More semantics. */
export const PERSONALIZATION_SLIDERS: StyleSliderConfig[] = [
  { key: 'warmth', label: 'Warmth', leftLabel: 'Cold', rightLabel: 'Warm' },
  { key: 'enthusiasm', label: 'Enthusiasm', leftLabel: 'Neutral', rightLabel: 'Enthusiastic' },
  { key: 'headersLists', label: 'Headers / Lists', leftLabel: 'Prose', rightLabel: 'Structured' },
  { key: 'emoji', label: 'Emoji', leftLabel: 'None', rightLabel: 'Frequent' },
];
