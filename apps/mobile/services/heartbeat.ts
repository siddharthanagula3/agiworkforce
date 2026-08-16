import type { AuditAction, AuditSeverity } from '@agiworkforce/types';
import { FEATURES } from '@/lib/v1FeatureFlags';

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
