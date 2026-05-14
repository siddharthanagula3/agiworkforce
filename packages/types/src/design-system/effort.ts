// packages/types/src/design-system/effort.ts

/** UI-facing effort axis. Locked vocabulary per DECISIONS.md D5. */
export type Effort = 'low' | 'medium' | 'high' | 'max';

export const EFFORT_LABEL: Readonly<Record<Effort, string>> = Object.freeze({
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  max: 'Max',
});

/** Anthropic thinking.budget_tokens by effort level. */
export const ANTHROPIC_THINKING_BUDGET: Readonly<Record<Effort, number>> = Object.freeze({
  low: 4096,
  medium: 16384,
  high: 32768,
  max: 65536,
});

/** OpenAI reasoning.effort string by effort level (note: 'max' falls back to 'high' for o-series). */
export const OPENAI_REASONING_EFFORT: Readonly<Record<Effort, 'low' | 'medium' | 'high'>> =
  Object.freeze({
    low: 'low',
    medium: 'medium',
    high: 'high',
    max: 'high',
  });

/** Gemini thinkingConfig.thinkingBudget by effort level. */
export const GEMINI_THINKING_BUDGET: Readonly<Record<Effort, number>> = Object.freeze({
  low: 4096,
  medium: 16384,
  high: 32768,
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
    case 'openai':
      return { reasoning: { effort: OPENAI_REASONING_EFFORT[effort] } };
    case 'google':
      return {
        generationConfig: { thinkingConfig: { thinkingBudget: GEMINI_THINKING_BUDGET[effort] } },
      };
    default:
      return null;
  }
}
