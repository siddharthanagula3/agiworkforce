/**
 * Mobile Surface Heartbeat + Audit Logging Service
 *
 * Upserts to `surface_heartbeats` with surface='mobile' while the companion
 * screen is active and repeats every 60 s.
 *
 * Also exports helpers for writing audit events to `surface_activity_log`
 * when the user approves/denies a tool or triggers an emergency stop.
 */

import { supabase } from './supabase';
import type { AuditAction, AuditSeverity } from '@agiworkforce/types';
import { createAuditEvent } from '@agiworkforce/types';

const HEARTBEAT_INTERVAL_MS = 60_000; // 60 seconds

// ---------------------------------------------------------------------------
// Heartbeat
// ---------------------------------------------------------------------------

async function sendMobileHeartbeat(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id;
  if (!userId) return;

  try {
    // surface_heartbeats is not in the generated DB types yet — cast to any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any;
    await client.from('surface_heartbeats').upsert(
      {
        user_id: userId,
        surface: 'mobile',
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,surface' },
    );
  } catch (err) {
    // Non-fatal — table may not be migrated in all envs
    console.debug('[Heartbeat] Mobile upsert failed (non-fatal):', err);
  }
}

/**
 * Start mobile heartbeat pings.
 * Call this when the companion screen mounts and the user is connected.
 *
 * @returns Cleanup function — call when the screen unmounts
 */
export function startMobileHeartbeat(): () => void {
  void sendMobileHeartbeat();

  const intervalId = setInterval(() => {
    void sendMobileHeartbeat();
  }, HEARTBEAT_INTERVAL_MS);

  return () => {
    clearInterval(intervalId);
  };
}

// ---------------------------------------------------------------------------
// Audit event logging to surface_activity_log
// ---------------------------------------------------------------------------

async function writeAuditEvent(params: {
  userId: string;
  action: AuditAction;
  resource: string;
  severity?: AuditSeverity;
  outcome?: 'success' | 'failure' | 'denied';
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const event = createAuditEvent({
    userId: params.userId,
    surface: 'mobile',
    action: params.action,
    resource: params.resource,
    outcome: params.outcome ?? 'success',
    severity: params.severity,
    metadata: params.metadata,
  });

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any;
    await client.from('surface_activity_log').insert({
      id: event.eventId,
      user_id: event.userId,
      surface_id: event.surface,
      action_label: event.action,
      severity: event.severity,
      outcome: event.outcome,
      resource: event.resource,
      metadata: event.metadata ?? null,
      created_at: event.timestamp,
    });
  } catch (err) {
    // Non-fatal
    console.debug('[Audit] surface_activity_log insert failed (non-fatal):', err);
  }
}

/**
 * Log a tool approval decision to the audit log.
 *
 * @param userId  - Authenticated user ID
 * @param toolName - Name of the tool that was approved or denied
 * @param approved - Whether the action was approved (true) or denied (false)
 * @param reason   - Optional rejection reason
 */
export async function logApprovalDecision(
  userId: string,
  toolName: string,
  approved: boolean,
  reason?: string,
): Promise<void> {
  await writeAuditEvent({
    userId,
    action: approved ? 'tool_approved' : 'tool_denied',
    resource: toolName,
    outcome: approved ? 'success' : 'denied',
    metadata: reason ? { reason } : undefined,
  });
}

/**
 * Log an emergency stop event as a critical audit event.
 *
 * @param userId   - Authenticated user ID
 * @param resource - What was stopped (e.g., agent session ID or 'all_agents')
 */
export async function logEmergencyStop(userId: string, resource: string): Promise<void> {
  await writeAuditEvent({
    userId,
    action: 'agent_cancelled',
    resource,
    severity: 'critical',
    outcome: 'success',
    metadata: { trigger: 'emergency_stop' },
  });
}
