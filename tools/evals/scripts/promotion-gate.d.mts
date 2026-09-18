/**
 * The gate reads a measured run defensively, field by field, so these describe
 * what it needs rather than the whole report type: a fixture that supplies a
 * score and a threshold is a valid input to it.
 */
export interface SliceSummaryLike {
  readonly total: number;
  readonly passed: number;
  readonly score: number;
}

export interface SuiteSummaryLike {
  readonly version?: number;
  readonly priority?: string;
  readonly threshold?: number;
  readonly score: number;
  readonly completeness?: number | null;
  readonly cost?: { readonly meanUsd?: number | null };
  readonly latency?: { readonly p95Ms?: number | null };
  readonly slices?: Readonly<Record<string, Readonly<Record<string, SliceSummaryLike>>>> | null;
}

export interface MeasuredRunLike {
  readonly source?: string;
  readonly recordingSource?: string;
  readonly suites?: Readonly<Record<string, SuiteSummaryLike>>;
  readonly unsupportedSuites?: Readonly<Record<string, string>>;
}

export interface GateTolerance {
  readonly scoreDrop: number;
  readonly costIncreaseRatio: number;
  readonly latencyP95IncreaseRatio: number;
  readonly completenessDrop: number;
}

export interface GatePolicy {
  readonly schemaVersion: number;
  readonly tolerance: GateTolerance;
  readonly familyOverrides?: Readonly<Record<string, Partial<GateTolerance>>>;
}

export interface GateFinding {
  readonly suite: string;
  readonly axis: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface GateVerdict {
  readonly passed: boolean;
  readonly refusals: readonly string[];
  readonly findings: readonly GateFinding[];
}

export interface BaselineAudit {
  readonly passed: boolean;
  readonly problems: readonly string[];
  readonly unmet: readonly string[];
  readonly audited: readonly string[];
}

export const MEASUREMENTS_DIR: string;
export const GATE_POLICY_FILE: string;
export function measurementFileName(key: string): string;
export function scoreFloor(
  base: Pick<SuiteSummaryLike, 'score' | 'threshold'>,
  tolerance: Pick<GateTolerance, 'scoreDrop'>,
): number;
export function auditBaselines(options: {
  readonly measurementsDir?: string;
  readonly families?: Readonly<Record<string, unknown>>;
}): BaselineAudit;

export function readGatePolicy(file?: string): GatePolicy;
export function toleranceFor(policy: GatePolicy, familyId: string): GateTolerance;
export function compareToBaseline(
  baseline: MeasuredRunLike,
  candidate: MeasuredRunLike,
  tolerance: GateTolerance,
): GateFinding[];
export function scoreDropFor(
  base: { readonly priority?: string },
  tolerance: Pick<GateTolerance, 'scoreDrop'>,
): number;
export function compareRuns(options: {
  readonly baseline: MeasuredRunLike;
  readonly candidate: MeasuredRunLike;
  readonly policy?: GatePolicy;
  readonly label?: string;
}): GateVerdict;
export function evaluatePromotionGate(options: {
  readonly familyId: string;
  readonly candidateModelKey: string;
  readonly measurementsDir?: string;
  readonly policy?: GatePolicy;
}): GateVerdict;
