export type Effort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export const EFFORT_LABEL: Readonly<Record<Effort, string>> = Object.freeze({
  none: 'Direct',
  minimal: 'Brief',
  low: 'Quick',
  medium: 'Balanced',
  high: 'Deep',
  xhigh: 'Extended',
  max: 'Maximum',
});

export const EFFORT_DESCRIPTION: Readonly<Record<Effort, string>> = Object.freeze({
  none: 'No extra reasoning for straightforward replies.',
  minimal: 'Minimal extra reasoning for simple tasks.',
  low: 'A short reasoning pass with less waiting.',
  medium: 'A balance of reasoning depth and response time.',
  high: 'More reasoning for complex tasks; may take longer.',
  xhigh: 'Additional reasoning for difficult tasks; may take longer.',
  max: 'The highest available reasoning setting; expect the longest wait.',
});

export const ANTHROPIC_THINKING_BUDGET: Readonly<
  Record<Exclude<Effort, 'none' | 'minimal'>, number>
> = Object.freeze({
  low: 4096,
  medium: 16384,
  high: 32768,
  xhigh: 49152,
  max: 65536,
});
