import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { recordAuditEvent } from '@/lib/security-audit';
import {
  listEnforcedDomainPolicies,
  sweepOrganizationDomain,
  type DomainSweepResult,
} from '@/lib/services/domain-retention-service';

export const runtime = 'nodejs';

const MAX_POLICIES_PER_RUN = 100;

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized domain retention cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getNeonDb();

  let policies: Awaited<ReturnType<typeof listEnforcedDomainPolicies>>;
  try {
    policies = await listEnforcedDomainPolicies(db);
  } catch (error) {
    logger.error({ error }, 'Domain retention could not list policies; nothing was deleted');
    return NextResponse.json({ error: 'Domain retention unavailable' }, { status: 503 });
  }

  const scheduled = policies.slice(0, MAX_POLICIES_PER_RUN);
  const results: DomainSweepResult[] = [];

  for (const policy of scheduled) {
    const result = await sweepOrganizationDomain(db, policy);
    results.push(result);
    if (result.outcome === 'nothing_due') continue;
    await recordAuditEvent({
      userId: 'system',
      eventType: 'domain_retention_sweep_completed',
      organizationId: policy.organizationId,
      outcome: result.outcome === 'deleted' ? 'success' : 'failure',
      severity: result.outcome === 'deleted' ? 'warning' : 'critical',
      detail: {
        resourceType: 'organization_retention',
        resourceId: policy.organizationId,
        resourceName: policy.domain,
        scope: policy.domain,
        status: result.outcome,
        deleted: result.recordsDeleted,
        held: result.recordsHeld,
        count: result.objectsDeleted,
        ...(result.error ? { reason: result.error } : {}),
      },
    }).catch((error: unknown) => {
      logger.error(
        { error, organizationId: policy.organizationId, domain: policy.domain },
        'Domain retention audit write failed',
      );
    });
  }

  const summary = {
    policiesConsidered: policies.length,
    policiesSwept: scheduled.length,
    policiesDeferred: policies.length - scheduled.length,
    recordsDeleted: results.reduce((sum, r) => sum + r.recordsDeleted, 0),
    recordsHeld: results.reduce((sum, r) => sum + r.recordsHeld, 0),
    objectsDeleted: results.reduce((sum, r) => sum + r.objectsDeleted, 0),
    objectsFailed: results.reduce((sum, r) => sum + r.objectsFailed, 0),
    held: results.filter((r) => r.outcome === 'held').length,
    aborted: results.filter((r) => r.outcome === 'aborted').length,
    failed: results.filter((r) => r.outcome === 'failed').length,
  };
  if (summary.policiesDeferred > 0) {
    logger.warn(summary, 'Domain retention deferred policies past the per-run cap');
  }
  logger.info(summary, 'Domain retention sweep completed');
  return NextResponse.json(summary);
}
