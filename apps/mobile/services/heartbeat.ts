import type { AuditAction, AuditSeverity } from '@agiworkforce/types';
import { FEATURES } from '@/lib/v1FeatureFlags';

/**
 * Cloud heartbeat/audit writes are separate from the paired companion's signed
 * transport heartbeat. Keep this no-op until a server-owned audit endpoint is
 * available; the live Dispatch connection is monitored in companion.ts.
 */

export function startMobileHeartbeat(): () => void {
  if (!FEATURES.companion) return () => {};
  return () => {};
}

export async function logApprovalDecision(
  userId: string,
  toolName: string,
  approved: boolean,
  reason?: string,
): Promise<void> {
  void userId;
  void toolName;
  void approved;
  void reason;
  if (!FEATURES.companion) return;
}

export async function logEmergencyStop(userId: string, resource: string): Promise<void> {
  void userId;
  void resource;
  if (!FEATURES.companion) return;
}

export type { AuditAction, AuditSeverity };
