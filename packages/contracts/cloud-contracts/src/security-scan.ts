import { z } from 'zod';
import { EFFORT_LABEL, type Effort, type LifecycleStatus } from '@agiworkforce/types';

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
export const SECURITY_SCAN_MODEL_MAX_LENGTH = 120;
export const SECURITY_SCAN_EFFORTS = Object.keys(EFFORT_LABEL) as [Effort, ...Effort[]];
export const SECURITY_SCAN_FINDING_ID_PATTERN = /^[0-9a-f]{16}$/;

const SECURITY_SCAN_API_ROOT = '/api/security-scan/sessions';

export function securityScanSessionPath(sessionId: string): string {
  return `${SECURITY_SCAN_API_ROOT}/${encodeURIComponent(sessionId)}`;
}

export function securityScanFindingPath(sessionId: string, findingId: string): string {
  return `${securityScanSessionPath(sessionId)}/findings/${encodeURIComponent(findingId)}`;
}

export const SecurityScanRequestSchema = z
  .object({
    consent: z.literal(true),
    scope: z.string().max(SECURITY_SCAN_SCOPE_MAX_LENGTH).optional(),
    model: z.string().min(1).max(SECURITY_SCAN_MODEL_MAX_LENGTH).optional(),
    effort: z.enum(SECURITY_SCAN_EFFORTS).optional(),
  })
  .strict();
export type SecurityScanRequest = z.infer<typeof SecurityScanRequestSchema>;

export const SecurityScanDecisionRequestSchema = z
  .object({
    scanId: z.uuid(),
    decision: z.enum(SECURITY_SCAN_DECISIONS),
  })
  .strict();
export type SecurityScanDecisionRequest = z.infer<typeof SecurityScanDecisionRequestSchema>;

export const SecurityScanFindingSchema = z
  .object({
    id: z.string().regex(SECURITY_SCAN_FINDING_ID_PATTERN),
    path: z.string().min(1).max(512),
    line: z.number().int().positive(),
    severity: z.enum(SECURITY_SCAN_SEVERITIES),
    category: z.string().min(1).max(80),
    title: z.string().min(1).max(160),
    explanation: z.string().min(1).max(1500),
    evidence: z.string().min(1).max(1200),
    verification: z.string().min(1).max(600),
    patch: z.string().min(1).max(20_000),
    state: z.enum(SECURITY_SCAN_FINDING_STATES),
    decidedAt: z.string().nullable(),
  })
  .strict();
export type SecurityScanFinding = z.infer<typeof SecurityScanFindingSchema>;

const CountSchema = z.number().int().nonnegative();

export const SecurityScanCoverageSchema = z
  .object({
    scope: z.string().nullable(),
    candidateFiles: CountSchema,
    scannedFiles: CountSchema,
    scannedBytes: CountSchema,
    skippedFiles: CountSchema,
  })
  .strict();
export type SecurityScanCoverage = z.infer<typeof SecurityScanCoverageSchema>;

export const SecurityScanDroppedSchema = z
  .object({
    unanchored: CountSchema,
    patchRejected: CountSchema,
    refuted: CountSchema,
    unparsable: CountSchema,
  })
  .strict();
export type SecurityScanDropped = z.infer<typeof SecurityScanDroppedSchema>;

export const SecurityScanCompletedReportSchema = z
  .object({
    status: z.literal(SECURITY_SCAN_STATUS.completed),
    scanId: z.uuid(),
    startedAt: z.string(),
    completedAt: z.string(),
    commit: z.string().nullable(),
    model: z.string(),
    coverage: SecurityScanCoverageSchema,
    dropped: SecurityScanDroppedSchema,
    findings: z.array(SecurityScanFindingSchema),
  })
  .strict();
export type SecurityScanCompletedReport = z.infer<typeof SecurityScanCompletedReportSchema>;

export const SecurityScanRunningReportSchema = z
  .object({
    status: z.literal(SECURITY_SCAN_STATUS.running),
    scanId: z.uuid(),
    startedAt: z.string(),
  })
  .strict();
export type SecurityScanRunningReport = z.infer<typeof SecurityScanRunningReportSchema>;

export const SecurityScanFailedReportSchema = z
  .object({
    status: z.literal(SECURITY_SCAN_STATUS.failed),
    scanId: z.uuid(),
    startedAt: z.string(),
    error: z.string().max(500),
  })
  .strict();
export type SecurityScanFailedReport = z.infer<typeof SecurityScanFailedReportSchema>;

export const SecurityScanReportSchema = z.discriminatedUnion('status', [
  SecurityScanCompletedReportSchema,
  SecurityScanRunningReportSchema,
  SecurityScanFailedReportSchema,
]);
export type SecurityScanReport = z.infer<typeof SecurityScanReportSchema>;

export interface SecurityScanSessionSummary {
  id: string;
  title: string;
  repositoryUrl: string | null;
  workingBranch: string | null;
  pullRequestUrl: string | null;
}

export interface SecurityScanModelOption {
  id: string;
  name: string;
  efforts: Effort[];
}

export interface SecurityScanStateResponse {
  session: SecurityScanSessionSummary;
  report: SecurityScanReport | null;
  /** The models this account may choose for a scan. Empty means Auto only. */
  models: SecurityScanModelOption[];
}

export interface SecurityScanResponse {
  report: SecurityScanCompletedReport;
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
