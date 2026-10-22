import { codeSessionPath } from '@/features/code/code-surface';

const SECURITY_SCAN_SEGMENT = 'security';

export function securityScanPagePath(sessionId: string): string {
  return `${codeSessionPath(sessionId)}/${SECURITY_SCAN_SEGMENT}`;
}
