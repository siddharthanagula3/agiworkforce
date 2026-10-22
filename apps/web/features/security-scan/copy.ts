import type { SecurityScanSeverity } from '@agiworkforce/cloud-contracts';

export const SECURITY_SCAN_COPY = {
  title: 'Security scan',
  back: 'Back to session',
  description:
    'Finds exploitable vulnerabilities, checks each one, and proposes a fix you approve.',
  noRepository: 'Open this session on a GitHub repository to scan it.',
  scopeLabel: 'Folder to scan',
  scopePlaceholder: 'Whole repository',
  modelLabel: 'Model',
  modelAuto: 'Auto',
  effortLabel: 'Effort',
  effortDefault: 'Default',
  consentLabel: 'Send source files from this repository to the scan model',
  scan: 'Scan repository',
  rescan: 'Scan again',
  scanning: 'Scanning. This can take a few minutes.',
  loadFailed: 'The scan could not be loaded.',
  scanFailed: 'The scan could not finish.',
  retry: 'Try again',
  noFindings: 'No validated vulnerabilities found in the files scanned.',
  explanation: 'Why it matters',
  evidence: 'Code',
  verification: 'Validation',
  patch: 'Proposed fix',
  approve: 'Approve fix',
  dismiss: 'Dismiss',
  approved: 'Fix approved',
  dismissed: 'Dismissed',
  pullRequest: 'View pull request',
  approveTitle: 'Approve this fix?',
  approveConfirm: 'Approve and push',
  dismissTitle: 'Dismiss this finding?',
  dismissDescription:
    'It stays in this report as dismissed and its fix is not applied. Only a new scan can raise it again.',
  dismissConfirm: 'Dismiss',
  decisionFailed: 'That decision could not be saved.',
} as const;

export function approveDescription(path: string, branch: string | null): string {
  const target = branch ? `the ${branch} branch` : "this session's branch";
  return `This changes ${path}, commits it to ${target}, pushes it to GitHub and opens or updates the pull request. Undoing it takes a new commit.`;
}

export const SEVERITY_LABEL: Record<SecurityScanSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function findingsSummary(count: number): string {
  return plural(count, 'validated finding', 'validated findings');
}

export function coverageSummary(scanned: number, candidates: number): string {
  return `${scanned} of ${plural(candidates, 'source file', 'source files')} scanned`;
}

export function droppedSummary(dropped: number): string | null {
  return dropped > 0
    ? `${plural(dropped, 'possible issue', 'possible issues')} set aside after validation`
    : null;
}
