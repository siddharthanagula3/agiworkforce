import 'server-only';

import { logger } from '@/lib/logger';
import { e2bExecutionEnabled } from './gate';
import { meterSandboxComputeInterval } from './compute-metering';
import { templateVcpuCount } from './templates';
import {
  MANAGED_CLOUD_E2B_TENANT_ID,
  getE2BSession,
  deleteE2BSession,
  type E2BSessionScope,
} from './session-store';

export const SANDBOX_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * A paused sandbox is a warm cache, not the conversation: its state can be
 * rebuilt on the next run. It still holds a slot against the per-user cap, so
 * it gives that slot up long before a running one would.
 */
export const PAUSED_SANDBOX_MAX_AGE_MS = 2 * 60 * 60 * 1000;

const MAX_RECLAIMED_PER_RUN = 200;

export interface SandboxReclaimReport {
  inspected: number;
  reclaimed: number;
  retained: number;
  failed: number;
  meteredCents: number;
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

export async function reclaimAbandonedE2BSandboxes(
  options: { maxAgeMs?: number; pausedMaxAgeMs?: number; now?: Date } = {},
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
  const pausedMaxAgeMs = Math.min(options.pausedMaxAgeMs ?? PAUSED_SANDBOX_MAX_AGE_MS, maxAgeMs);
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
      const ageLimitMs = info.state === 'paused' ? pausedMaxAgeMs : maxAgeMs;
      const expired = ageMs >= ageLimitMs;

      const session = scope ? await getE2BSession(scope) : null;
      const isCurrentMapping = session?.sandboxId === info.sandboxId;
      const orphaned = scope ? !isCurrentMapping : false;

      if (!expired && !orphaned) {
        report.retained += 1;
        continue;
      }

      if (scope && isCurrentMapping && session && typeof session.activeSinceMs === 'number') {
        report.meteredCents += await meterSandboxComputeInterval({
          userId: scope.userId,
          sandboxId: info.sandboxId,
          ...(scope.conversationId ? { conversationId: scope.conversationId } : {}),
          ...(scope.resource?.kind === 'code_session' ? { codeSessionId: scope.resource.id } : {}),
          vcpuCount: (await templateVcpuCount(session.templateId)) ?? undefined,
          startedAtMs: session.activeSinceMs,
          endedAtMs: nowMs,
          reason: 'reclaim',
        });
      }

      try {
        await Sandbox.kill(info.sandboxId);
        report.reclaimed += 1;
        // Deleting the mapping only when it still points at the sandbox we just
        // killed keeps an orphan's cleanup from severing a DIFFERENT, still-live
        // sandbox's current mapping for the same scope.
        if (scope && isCurrentMapping) await deleteE2BSession(scope);
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
