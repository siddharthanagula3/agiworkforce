import type { PersonalizationStyle } from '@/stores/settingsStore';

export interface StyleOption {
  value: PersonalizationStyle;
  label: string;
  description: string;
}

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

export const PERSONALIZATION_SLIDERS: StyleSliderConfig[] = [
  { key: 'warmth', label: 'Warmth', leftLabel: 'Cold', rightLabel: 'Warm' },
  { key: 'enthusiasm', label: 'Enthusiasm', leftLabel: 'Neutral', rightLabel: 'Enthusiastic' },
  { key: 'headersLists', label: 'Headers / Lists', leftLabel: 'Prose', rightLabel: 'Structured' },
  { key: 'emoji', label: 'Emoji', leftLabel: 'None', rightLabel: 'Frequent' },
];
