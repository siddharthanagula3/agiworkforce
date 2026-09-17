import type { RunReport } from '../src/report';

export interface GateTolerance {
  readonly scoreDrop: number;
  readonly costIncreaseRatio: number;
  readonly latencyP95IncreaseRatio: number;
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

export const MEASUREMENTS_DIR: string;
export const GATE_POLICY_FILE: string;
export function measurementFileName(key: string): string;
export function readGatePolicy(file?: string): GatePolicy;
export function toleranceFor(policy: GatePolicy, familyId: string): GateTolerance;
export function compareToBaseline(
  baseline: Pick<RunReport, 'suites'>,
  candidate: Pick<RunReport, 'suites' | 'unsupportedSuites'>,
  tolerance: GateTolerance,
): GateFinding[];
export function evaluatePromotionGate(options: {
  readonly familyId: string;
  readonly candidateModelKey: string;
  readonly measurementsDir?: string;
  readonly policy?: GatePolicy;
}): GateVerdict;
