import type { LifecycleStatus } from '@agiworkforce/types';

export const SECURITY_SCAN_STATUS = {
  running: 'running',
  completed: 'completed',
  failed: 'failed',
} as const satisfies Record<string, LifecycleStatus>;

export const SECURITY_SCAN_SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
export type SecurityScanSeverity = (typeof SECURITY_SCAN_SEVERITIES)[number];

export const SECURITY_SCAN_FINDING_STATES = ['open', 'approved', 'dismissed'] as const;
export type SecurityScanFindingState = (typeof SECURITY_SCAN_FINDING_STATES)[number];

export const SECURITY_SCAN_DECISIONS = ['approve', 'dismiss'] as const;
export type SecurityScanDecision = (typeof SECURITY_SCAN_DECISIONS)[number];

export const SECURITY_SCAN_SCOPE_MAX_LENGTH = 200;

export interface SecurityScanFinding {
  id: string;
  path: string;
  line: number;
  severity: SecurityScanSeverity;
  category: string;
  title: string;
  explanation: string;
  evidence: string;
  verification: string;
  patch: string;
  state: SecurityScanFindingState;
  decidedAt: string | null;
}

export interface SecurityScanCoverage {
  scope: string | null;
  candidateFiles: number;
  scannedFiles: number;
  scannedBytes: number;
  skippedFiles: number;
}

export interface SecurityScanDropped {
  unanchored: number;
  patchRejected: number;
  refuted: number;
  unparsable: number;
}

export interface SecurityScanCompletedReport {
  status: typeof SECURITY_SCAN_STATUS.completed;
  scanId: string;
  startedAt: string;
  completedAt: string;
  commit: string | null;
  model: string;
  coverage: SecurityScanCoverage;
  dropped: SecurityScanDropped;
  findings: SecurityScanFinding[];
}

export interface SecurityScanRunningReport {
  status: typeof SECURITY_SCAN_STATUS.running;
  scanId: string;
  startedAt: string;
}

export interface SecurityScanFailedReport {
  status: typeof SECURITY_SCAN_STATUS.failed;
  scanId: string;
  startedAt: string;
  error: string;
}

export type SecurityScanReport =
  SecurityScanCompletedReport | SecurityScanRunningReport | SecurityScanFailedReport;

export interface SecurityScanSessionSummary {
  id: string;
  title: string;
  repositoryUrl: string | null;
  workingBranch: string | null;
  pullRequestUrl: string | null;
}

export interface SecurityScanStateResponse {
  session: SecurityScanSessionSummary;
  report: SecurityScanReport | null;
}

export interface SecurityScanDeliveryResult {
  status: 'pushed' | typeof SECURITY_SCAN_STATUS.failed;
  pullRequestUrl: string | null;
  error: string | null;
}

export interface SecurityScanDecisionResponse {
  report: SecurityScanCompletedReport;
  delivery: SecurityScanDeliveryResult | null;
}
