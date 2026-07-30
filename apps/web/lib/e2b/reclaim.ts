/**
 * GOV-6 — reclaim abandoned managed sandboxes.
 *
 * Conversation-scoped sandboxes are PAUSED, not killed. The
 * `{tenantId,userId,conversationId} -> sandboxId` mapping that is the only way
 * to find one again lives in Redis under a 24h TTL, while `killE2BSession()` is
 * called solely on explicit conversation delete — and `app/api/cron/` had no
 * reclaim job (only reset-credits, purge-temporary-chats, reconcile-credits and
 * run-schedules). Once the key expired, the paused sandbox was unreachable but
 * still existed, counting against both the E2B team cap and the owner's plan
 * sandbox budget forever: a slow, permanent leak of the exact resource the
 * per-user cap exists to protect.
 *
 * This job is the reaper. A sandbox is reclaimed when it is older than the
 * retention window, or when its owning Redis mapping no longer points at it
 * (deleted conversation, expired key, replaced sandbox). Anything reclaimed
 * while still holding an open billable interval is settled first (GOV-5).
 */
import 'server-only';

import { logger } from '@/lib/logger';
import { e2bExecutionEnabled } from './gate';
import { meterSandboxComputeInterval } from './compute-metering';
import {
  MANAGED_CLOUD_E2B_TENANT_ID,
  getE2BSession,
  deleteE2BSession,
  type E2BSessionScope,
} from './session-store';

/**
 * Longest a sandbox may live before it is reclaimed regardless of mapping
 * state. Matches the session-store key TTL: past it, no mapping can exist, so
 * nothing can ever resume the sandbox again.
 */
export const SANDBOX_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Bound the work one cron invocation will do. */
const MAX_RECLAIMED_PER_RUN = 200;

export interface SandboxReclaimReport {
  /** Sandboxes inspected across all pages of the list API. */
  inspected: number;
  /** Sandboxes killed by this run. */
  reclaimed: number;
  /** Sandboxes left alone because a live mapping still points at them. */
  retained: number;
  /** Sandboxes that could not be killed; they are retried next run. */
  failed: number;
  /** Cents settled for intervals that were still open at reclaim time. */
  meteredCents: number;
  /** True when the executor is unconfigured and nothing was inspected. */
  skipped: boolean;
}

async function importSandbox(): Promise<typeof import('@e2b/code-interpreter').Sandbox | null> {
  try {
    const { Sandbox } = await import('@e2b/code-interpreter');
    return Sandbox;
  } catch (err) {
    logger.warn({ err }, '[e2b] @e2b/code-interpreter unavailable; reclaim skipped');
    return null;
  }
}

function scopeFromMetadata(metadata: Record<string, string>): E2BSessionScope | null {
  const userId = metadata['userId'];
  const conversationId = metadata['conversationId'];
  const codeSessionId = metadata['codeSessionId'];
  if (!userId) return null;
  if (conversationId) {
    return { tenantId: MANAGED_CLOUD_E2B_TENANT_ID, userId, conversationId };
  }
  if (codeSessionId) {
    return {
      tenantId: MANAGED_CLOUD_E2B_TENANT_ID,
      userId,
      resource: { kind: 'code_session', id: codeSessionId },
    };
  }
  return null;
}

/**
 * Kill every sandbox that nothing can reach any more.
 *
 * Untagged sandboxes (no `userId`/`conversationId` metadata) are ephemeral
 * bare-API ones, which E2B kills on their own short timeout; they are only
 * reclaimed once past `maxAgeMs`, so a live one is never pulled out from under
 * a request in flight.
 */
export async function reclaimAbandonedE2BSandboxes(
  options: { maxAgeMs?: number; now?: Date } = {},
): Promise<SandboxReclaimReport> {
  const report: SandboxReclaimReport = {
    inspected: 0,
    reclaimed: 0,
    retained: 0,
    failed: 0,
    meteredCents: 0,
    skipped: false,
  };

  if (!e2bExecutionEnabled()) {
    report.skipped = true;
    return report;
  }

  const Sandbox = await importSandbox();
  if (!Sandbox) {
    report.skipped = true;
    return report;
  }

  const maxAgeMs = options.maxAgeMs ?? SANDBOX_MAX_AGE_MS;
  const nowMs = (options.now ?? new Date()).getTime();

  let paginator;
  try {
    paginator = Sandbox.list({ query: { state: ['running', 'paused'] } });
  } catch (err) {
    logger.error({ err }, '[e2b] reclaim could not list sandboxes');
    report.skipped = true;
    return report;
  }

  while (paginator.hasNext && report.reclaimed < MAX_RECLAIMED_PER_RUN) {
    let page;
    try {
      page = await paginator.nextItems();
    } catch (err) {
      logger.error({ err }, '[e2b] reclaim list page failed; stopping this run');
      break;
    }

    for (const info of page) {
      report.inspected += 1;

      const ageMs = nowMs - info.startedAt.getTime();
      const scope = scopeFromMetadata(info.metadata ?? {});
      const expired = ageMs >= maxAgeMs;

      let orphaned = false;
      if (scope) {
        // A mapping that no longer names THIS sandbox means nothing can resume
        // it: the conversation was deleted, the key expired, or a later turn
        // already replaced it.
        const session = await getE2BSession(scope);
        orphaned = session?.sandboxId !== info.sandboxId;
      } else {
        // Untagged (ephemeral) sandboxes are only reclaimed once expired.
        orphaned = false;
      }

      if (!expired && !orphaned) {
        report.retained += 1;
        continue;
      }

      // GOV-5: settle any interval still open on the mapping before releasing.
      if (scope) {
        const session = await getE2BSession(scope);
        if (session?.sandboxId === info.sandboxId && typeof session.activeSinceMs === 'number') {
          report.meteredCents += await meterSandboxComputeInterval({
            userId: scope.userId,
            sandboxId: info.sandboxId,
            ...(scope.conversationId ? { conversationId: scope.conversationId } : {}),
            ...(scope.resource?.kind === 'code_session'
              ? { codeSessionId: scope.resource.id }
              : {}),
            startedAtMs: session.activeSinceMs,
            endedAtMs: nowMs,
            reason: 'reclaim',
          });
        }
      }

      try {
        await Sandbox.kill(info.sandboxId);
        report.reclaimed += 1;
        if (scope) await deleteE2BSession(scope);
        logger.info(
          {
            sandboxId: info.sandboxId,
            ageMs,
            expired,
            orphaned,
            userId: scope?.userId,
            conversationId: scope?.conversationId,
            codeSessionId: scope?.resource?.kind === 'code_session' ? scope.resource.id : undefined,
          },
          '[e2b] reclaimed abandoned sandbox',
        );
      } catch (err) {
        report.failed += 1;
        logger.warn({ err, sandboxId: info.sandboxId }, '[e2b] reclaim kill failed; will retry');
      }

      if (report.reclaimed >= MAX_RECLAIMED_PER_RUN) break;
    }
  }

  return report;
}
