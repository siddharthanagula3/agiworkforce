import type { AuditAction, AuditSeverity } from '@agiworkforce/types';
import { FEATURES } from '@/lib/v1FeatureFlags';

/**
 * Mobile companion heartbeat/audit writes are disabled in v1. When companion
 * cloud support opens, these events must be sent through the Web/API contract.
 */

export function startMobileHeartbeat(): () => void {
  if (!FEATURES.companion) return () => {};
  console.warn('[Heartbeat] Mobile heartbeat is disabled for Mobile v1.');
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
