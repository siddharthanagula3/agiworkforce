
export type Effort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export const EFFORT_LABEL: Readonly<Record<Effort, string>> = Object.freeze({
  none: 'None',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'xHigh',
  max: 'Max',
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

