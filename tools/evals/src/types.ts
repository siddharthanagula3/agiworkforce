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

/** The three corpora this harness grades. */
export type SuiteName = 'golden' | 'refusal' | 'jailbreak';

/**
 * What a case is asking the system under test to do.
 *
 * `refusal` and `safe-completion` are both correct answers to an adversarial
 * prompt, and conflating them is how a jailbreak corpus becomes useless: a
 * prompt-injection case is passed by summarising the document and ignoring the
 * injected order, and grading that as "must refuse" would score the right
 * behaviour as a failure.
 */
export type ExpectedBehaviour = 'answer' | 'refusal' | 'safe-completion';

/** Rollout risk label, per the eval-corpus requirements in the CPST design doc §6. */
export type RiskLabel = 'low' | 'high';

/** One deterministic assertion over a model response. */
export type Check =
  | { readonly kind: 'includesAny'; readonly values: readonly string[] }
  | { readonly kind: 'includesAll'; readonly values: readonly string[] }
  | { readonly kind: 'excludesAll'; readonly values: readonly string[] }
  | { readonly kind: 'matches'; readonly pattern: string }
  | { readonly kind: 'refuses' }
  | { readonly kind: 'maxWords'; readonly limit: number };

/** One labelled corpus row. */
export interface EvalCase {
  /** Stable id, `<suite>/<slug>`. Never renumber or reuse a shipped id. */
  readonly id: string;
  /** Task label used to segment the report. Free-form; not the routing taxonomy. */
  readonly family: string;
  readonly risk: RiskLabel;
  readonly expected: ExpectedBehaviour;
  readonly prompt: string;
  readonly checks: readonly Check[];
  /**
   * Why this row exists, when the prompt alone does not say.
   *
   * Carried into `CaseResult` and printed by `formatReport` when the row fails,
   * so whoever reads a failing CI log sees the row's rationale without opening
   * the corpus file.
   */
  readonly notes?: string;
}

/** A corpus file plus the gate it is scored against. */
export interface EvalDataset {
  readonly suite: SuiteName;
  /** Bumped whenever rows change, so a recorded score names the corpus it came from. */
  readonly version: number;
  /** Fraction of rows that must pass, in (0, 1]. */
  readonly passThreshold: number;
  readonly cases: readonly EvalCase[];
}

/**
 * One model answer.
 *
 * `stopReason` carries the provider's terminal stop when there is one. It
 * matters for grading: `refusal` is a first-class safety stop in this repo's
 * stream envelope (`services/api-gateway/src/lib/providerStreamSafety.ts`), and
 * a provider that stops with `refusal` may return no text at all — grading that
 * on text alone would score a correct refusal as a failure.
 */
export interface ModelResponse {
  readonly text: string;
  readonly stopReason?: string;
}

/** The system under test. */
export type Responder = (evalCase: EvalCase) => Promise<ModelResponse>;

export interface CheckResult {
  readonly check: Check;
  readonly passed: boolean;
  /** Human-readable reason, always populated — a failing row must say why. */
  readonly detail: string;
}

export interface CaseResult {
  readonly id: string;
  readonly family: string;
  readonly risk: RiskLabel;
  readonly passed: boolean;
  readonly checks: readonly CheckResult[];
  readonly response: ModelResponse;
  /** The row's `notes`, forwarded so a failure report can explain the row. */
  readonly notes?: string;
}

export interface SuiteReport {
  readonly suite: SuiteName;
  readonly version: number;
  readonly threshold: number;
  readonly total: number;
  readonly passed: number;
  /** passed / total, or 0 for an empty suite. */
  readonly score: number;
  /** Whether the gate is met. This is the only field a CI job should branch on. */
  readonly met: boolean;
  readonly cases: readonly CaseResult[];
}
