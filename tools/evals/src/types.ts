/**
 * Shapes for the AI output-quality eval harness.
 *
 * These types are deliberately dependency-free: `tools/` is not covered by any
 * of the globs in `pnpm-workspace.yaml` (apps, packages, provider packages,
 * services, infrastructure), so nothing here can resolve an `@agiworkforce`
 * import. Anything this harness needs from the product is read from a committed
 * JSON file at runtime, or loaded by relative path in the live runner, never
 * imported statically.
 *
 * @module evals/types
 * @packageDocumentation
 */

export type SuiteName =
  | 'golden'
  | 'refusal'
  | 'jailbreak'
  | 'chat'
  | 'coding'
  | 'reasoning'
  | 'research'
  | 'search'
  | 'tools'
  | 'structured-output'
  | 'long-context'
  | 'files'
  | 'browser'
  | 'computer-use'
  | 'multilingual';

export type ExpectedBehaviour = 'answer' | 'refusal' | 'safe-completion';

export type RiskLabel = 'low' | 'high';

export type ArgumentMatcher =
  | { readonly equals: string | number | boolean }
  | { readonly matches: string }
  | { readonly includes: string }
  | { readonly within: { readonly min: number; readonly max: number } };

export interface RequiredCitation {
  readonly claim: string;
  readonly source: string;
}

export type Check =
  | { readonly kind: 'includesAny'; readonly values: readonly string[] }
  | { readonly kind: 'includesAll'; readonly values: readonly string[] }
  | { readonly kind: 'excludesAll'; readonly values: readonly string[] }
  | { readonly kind: 'matches'; readonly pattern: string }
  | { readonly kind: 'refuses' }
  | { readonly kind: 'maxWords'; readonly limit: number }
  | { readonly kind: 'exactAnswer'; readonly expected: string; readonly tolerance?: number }
  | { readonly kind: 'jsonSchema'; readonly schema: Record<string, unknown> }
  | { readonly kind: 'jsonEquals'; readonly path: string; readonly value: unknown }
  | {
      readonly kind: 'codeTests';
      readonly module: string;
      readonly tests: string;
      readonly timeoutMs?: number;
    }
  | {
      readonly kind: 'toolCalled';
      readonly name: string;
      readonly position?: 'first' | 'any';
      readonly arguments?: Readonly<Record<string, ArgumentMatcher>>;
    }
  | { readonly kind: 'noToolCall'; readonly names?: readonly string[] }
  | { readonly kind: 'toolSequence'; readonly names: readonly string[] }
  | {
      readonly kind: 'citations';
      readonly sources: readonly string[];
      readonly minDistinct: number;
      readonly required?: readonly RequiredCitation[];
    }
  | {
      readonly kind: 'citedUrls';
      readonly allowed: readonly string[];
      readonly required: readonly string[];
    }
  | { readonly kind: 'language'; readonly expected: LanguageCode };

export type CheckKind = Check['kind'];

export type LanguageCode =
  | 'en'
  | 'es'
  | 'fr'
  | 'de'
  | 'it'
  | 'pt'
  | 'nl'
  | 'ru'
  | 'ar'
  | 'hi'
  | 'ja'
  | 'ko'
  | 'zh'
  | 'el'
  | 'he'
  | 'th';

export interface EvalToolDef {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

export interface EvalToolCall {
  readonly id?: string;
  readonly name: string;
  readonly input: Record<string, unknown>;
}

export type EvalTurn =
  | { readonly role: 'user'; readonly content: string }
  | {
      readonly role: 'assistant';
      readonly content: string;
      readonly toolCalls?: readonly EvalToolCall[];
    }
  | {
      readonly role: 'tool';
      readonly toolUseId: string;
      readonly content?: string;
      readonly fixture?: string;
    };

export interface EvalAttachment {
  readonly fixture: string;
  readonly mediaType: string;
}

export interface EvalSource {
  readonly id: string;
  readonly title: string;
  readonly url?: string;
  readonly text: string;
}

export interface EvalHaystack {
  readonly seed: number;
  readonly targetChars: number;
  readonly depth: number;
  readonly needle: string;
}

export interface EvalCase {
  readonly id: string;
  readonly family: string;
  readonly risk: RiskLabel;
  readonly expected: ExpectedBehaviour;
  readonly prompt: string;
  readonly checks: readonly Check[];
  readonly notes?: string;
  readonly system?: string;
  readonly turns?: readonly EvalTurn[];
  readonly tools?: readonly EvalToolDef[];
  readonly attachments?: readonly EvalAttachment[];
  readonly sources?: readonly EvalSource[];
  readonly haystack?: EvalHaystack;
}

export interface EvalDataset {
  readonly suite: SuiteName;
  readonly version: number;
  readonly passThreshold: number;
  readonly requires?: readonly string[];
  readonly maxOutputTokens?: number;
  readonly cases: readonly EvalCase[];
}

export interface ResponseUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly reasoningTokens?: number;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
}

export type CostSource = 'provider' | 'catalog';

/**
 * One model answer.
 *
 * `stopReason` carries the provider's terminal stop when there is one. It
 * matters for grading: `refusal` is a first-class safety stop in this repo's
 * stream envelope (`packages/contracts/types/src/provider-adapter.ts`), and
 * a provider that stops with `refusal` may return no text at all, grading that
 * on text alone would score a correct refusal as a failure.
 *
 * Usage, cost and timing are what the provider layer metered for this answer.
 * They are absent on hand-written reference responses, which never claim to
 * have cost anything.
 */
export interface ModelResponse {
  readonly text: string;
  readonly stopReason?: string;
  readonly toolCalls?: readonly EvalToolCall[];
  readonly usage?: ResponseUsage;
  readonly costUsd?: number;
  readonly costSource?: CostSource;
  readonly latencyMs?: number;
  readonly ttfbMs?: number;
}

export type Responder = (evalCase: EvalCase) => Promise<ModelResponse>;

export interface CheckResult {
  readonly check: Check;
  readonly passed: boolean;
  readonly detail: string;
}

export interface CaseResult {
  readonly id: string;
  readonly family: string;
  readonly risk: RiskLabel;
  readonly passed: boolean;
  readonly checks: readonly CheckResult[];
  readonly response: ModelResponse;
  readonly notes?: string;
}

export interface CostSummary {
  readonly meteredCases: number;
  readonly totalUsd: number | null;
  readonly meanUsd: number | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface LatencySummary {
  readonly timedCases: number;
  readonly p50Ms: number | null;
  readonly p95Ms: number | null;
  readonly ttfbP50Ms: number | null;
}

export interface SkippedCase {
  readonly id: string;
  readonly reason: string;
}

export interface SuiteReport {
  readonly suite: SuiteName;
  readonly version: number;
  readonly threshold: number;
  readonly total: number;
  readonly passed: number;
  readonly score: number;
  readonly met: boolean;
  readonly cost: CostSummary;
  readonly latency: LatencySummary;
  readonly skipped: readonly SkippedCase[];
  readonly cases: readonly CaseResult[];
}
