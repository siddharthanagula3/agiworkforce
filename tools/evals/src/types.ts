/**
 * Shapes for the AI output-quality eval harness.
 *
 * These types are deliberately dependency-free: `tools/` is not covered by any
 * of the globs in `pnpm-workspace.yaml` (apps, packages, provider packages,
 * services, infrastructure), so nothing here can resolve an `@agiworkforce`
 * import. Anything this harness needs from the product is read from a committed
 * JSON file at runtime, never imported.
 *
 * @module evals/types
 * @packageDocumentation
 */

export type SuiteName = 'golden' | 'refusal' | 'jailbreak';

export type ExpectedBehaviour = 'answer' | 'refusal' | 'safe-completion';

export type RiskLabel = 'low' | 'high';

export type Check =
  | { readonly kind: 'includesAny'; readonly values: readonly string[] }
  | { readonly kind: 'includesAll'; readonly values: readonly string[] }
  | { readonly kind: 'excludesAll'; readonly values: readonly string[] }
  | { readonly kind: 'matches'; readonly pattern: string }
  | { readonly kind: 'refuses' }
  | { readonly kind: 'maxWords'; readonly limit: number };

export interface EvalCase {
  readonly id: string;
  readonly family: string;
  readonly risk: RiskLabel;
  readonly expected: ExpectedBehaviour;
  readonly prompt: string;
  readonly checks: readonly Check[];
  readonly notes?: string;
}

export interface EvalDataset {
  readonly suite: SuiteName;
  readonly version: number;
  readonly passThreshold: number;
  readonly cases: readonly EvalCase[];
}

/**
 * One model answer.
 *
 * `stopReason` carries the provider's terminal stop when there is one. It
 * matters for grading: `refusal` is a first-class safety stop in this repo's
 * stream envelope (`packages/contracts/types/src/provider-adapter.ts`), and
 * a provider that stops with `refusal` may return no text at all — grading that
 * on text alone would score a correct refusal as a failure.
 */
export interface ModelResponse {
  readonly text: string;
  readonly stopReason?: string;
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

export interface SuiteReport {
  readonly suite: SuiteName;
  readonly version: number;
  readonly threshold: number;
  readonly total: number;
  readonly passed: number;
  readonly score: number;
  readonly met: boolean;
  readonly cases: readonly CaseResult[];
}
