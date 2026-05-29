// packages/types/src/design-system/effort.ts

/** UI-facing effort axis. Locked vocabulary per DECISIONS.md D5. */
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export const EFFORT_LABEL: Readonly<Record<Effort, string>> = Object.freeze({
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'xHigh',
  max: 'Max',
});

/** Anthropic thinking.budget_tokens by effort level. */
export const ANTHROPIC_THINKING_BUDGET: Readonly<Record<Effort, number>> = Object.freeze({
  low: 4096,
  medium: 16384,
  high: 32768,
  xhigh: 49152,
  max: 65536,
});

/** OpenAI reasoning.effort string by effort level. OpenAI has no Max effort. */
export const OPENAI_REASONING_EFFORT: Readonly<
  Partial<Record<Effort, 'low' | 'medium' | 'high' | 'xhigh'>>
> = Object.freeze({
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
});

/** Gemini thinkingConfig.thinkingBudget by effort level. */
export const GEMINI_THINKING_BUDGET: Readonly<Record<Effort, number>> = Object.freeze({
  low: 4096,
  medium: 16384,
  high: 32768,
  xhigh: 49152,
  max: 65536,
});

/**
 * Map a UI effort level to a per-provider request parameter slice.
 * Local providers (Ollama, LMStudio) and providers without effort support
 * return `null` — caller should not include any effort-related field.
 */
export function effortToProviderParams(
  effort: Effort,
  providerId: string,
): Record<string, unknown> | null {
  switch (providerId) {
    case 'anthropic':
      return { thinking: { type: 'enabled', budget_tokens: ANTHROPIC_THINKING_BUDGET[effort] } };
    case 'openai': {
      const reasoningEffort = OPENAI_REASONING_EFFORT[effort];
      return reasoningEffort ? { reasoning: { effort: reasoningEffort } } : null;
    }
    case 'google':
      return {
        generationConfig: { thinkingConfig: { thinkingBudget: GEMINI_THINKING_BUDGET[effort] } },
      };
    default:
      return null;
  }
}
