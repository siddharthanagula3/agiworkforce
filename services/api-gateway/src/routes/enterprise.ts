import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  DEFAULT_ENTERPRISE_ADMIN_POLICY,
  isOrganizationAdminRole,
  type OrganizationRole,
  type SupportCase,
} from '@agiworkforce/types';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { createRateLimiter } from '../middleware/rateLimit';
import { getUserScopedClient, type CloudDbClient } from '../lib/neonClients';
import { logger } from '../lib/logger';

const router: Router = Router();

router.use(createRateLimiter('default'));
router.use(authenticateToken);

const uuidParamSchema = z.object({
  orgId: z.uuid(),
});

const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const auditExportQuerySchema = z.object({
  format: z.enum(['jsonl', 'csv']).default('jsonl'),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(1000),
  offset: z.coerce.number().int().min(0).default(0),
});

const AUDIT_EXPORT_COLUMNS = [
  'id',
  'organization_id',
  'actor_user_id',
  'surface',
  'action',
  'resource_type',
  'resource_id',
  'outcome',
  'severity',
  'metadata',
  'created_at',
] as const;

interface AuditEventRow {
  id: string;
  organization_id: string;
  actor_user_id: string | null;
  surface: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  outcome: string;
  severity: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  const guarded = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replace(/"/g, '""')}"`;
}

function toCsv(rows: AuditEventRow[], includeHeader: boolean): string {
  const lines: string[] = [];
  if (includeHeader) lines.push(AUDIT_EXPORT_COLUMNS.join(','));
  for (const row of rows) {
    lines.push(AUDIT_EXPORT_COLUMNS.map((column) => csvCell(row[column])).join(','));
  }
  return lines.length > 0 ? `${lines.join('\n')}\n` : '';
}

function toJsonl(rows: AuditEventRow[]): string {
  return rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length > 0 ? '\n' : '');
}

const supportCaseSchema = z.object({
  subject: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(5000),
  severity: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  privacyLabel: z
    .enum(['local_only', 'byok', 'managed', 'security_sensitive'])
    .default('security_sensitive'),
});

interface MembershipRow {
  organization_id: string;
  role: OrganizationRole;
  joined_at: string;
}

interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface EnterprisePolicyRow {
  organization_id: string;
  default_privacy_mode: string;
  allowed_privacy_modes: string[];
  allow_managed_compute: boolean;
  require_local_to_byok_preview: boolean;
  chat_sync_surfaces: string[];
  allow_cli_cloud_sync: boolean;
  allow_vscode_cloud_sync: boolean;
  allow_chrome_cloud_sync: boolean;
  audit_export_enabled: boolean;
  retention_days: number;
  metadata?: Record<string, unknown> | null;
  updated_at: string;
}

function requireUser(req: Request) {
  const user = req.user;
  if (!user) {
    throw new AppError('Unauthorized', 401);
  }
  return user;
}

function mapPolicy(row: EnterprisePolicyRow | null, organizationId: string) {
  if (!row) {
    return {
      organizationId,
      ...DEFAULT_ENTERPRISE_ADMIN_POLICY,
      updatedAt: null,
    };
  }

  return {
    organizationId: row.organization_id,
    defaultPrivacyMode: row.default_privacy_mode,
    allowedPrivacyModes: row.allowed_privacy_modes,
    allowManagedCompute: row.allow_managed_compute,
    requireLocalToByokPreview: row.require_local_to_byok_preview,
    chatSyncSurfaces: row.chat_sync_surfaces,
    allowCliCloudSync: row.allow_cli_cloud_sync,
    allowVsCodeCloudSync: row.allow_vscode_cloud_sync,
    allowChromeCloudSync: row.allow_chrome_cloud_sync,
    auditExportEnabled: row.audit_export_enabled,
    retentionDays: row.retention_days,
    metadata: row.metadata ?? {},
    updatedAt: row.updated_at,
  };
}

async function fetchPolicyRow(
  db: CloudDbClient,
  organizationId: string,
): Promise<EnterprisePolicyRow | null> {
  const { data, error } = await db
    .from('organization_admin_policies')
    .select(
      `
        organization_id,
        default_privacy_mode,
        allowed_privacy_modes,
        allow_managed_compute,
        require_local_to_byok_preview,
        chat_sync_surfaces,
        allow_cli_cloud_sync,
        allow_vscode_cloud_sync,
        allow_chrome_cloud_sync,
        audit_export_enabled,
        retention_days,
        metadata,
        updated_at
      `,
    )
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) {
    logger.error({ error, orgId: organizationId }, 'Failed to fetch enterprise policy');
    throw new AppError('Failed to fetch policy', 500);
  }

  return (data as EnterprisePolicyRow | null) ?? null;
}

async function getMembershipRole(
  db: CloudDbClient,
  organizationId: string,
  userId: string,
): Promise<OrganizationRole> {
  const { data, error } = await db
    .from('organization_members')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    logger.error({ error, organizationId, userId }, 'Failed to verify organization membership');
    throw new AppError('Failed to verify organization membership', 500);
  }

  const role = (data as { role?: OrganizationRole } | null)?.role;
  if (!role) {
    throw new AppError('Organization access denied', 403);
  }

  return role;
}

async function requireMembershipRole(
  db: CloudDbClient,
  organizationId: string,
  userId: string,
  allowed: 'member' | 'admin',
): Promise<OrganizationRole> {
  const role = await getMembershipRole(db, organizationId, userId);
  if (allowed === 'admin' && !isOrganizationAdminRole(role)) {
    throw new AppError('Organization admin access required', 403);
  }
  return role;
}

router.get(
  '/organizations',
  createRateLimiter('enterprise-organizations'),
  async (req: Request, res: Response) => {
    const user = requireUser(req);
    const db = getUserScopedClient(user);

    const { data: membershipData, error: membershipError } = await db
      .from('organization_members')
      .select('organization_id, role, joined_at')
      .eq('user_id', user.userId)
      .order('joined_at', { ascending: false });

    if (membershipError) {
      logger.error(
        { error: membershipError, userId: user.userId },
        'Failed to fetch enterprise organizations',
      );
      throw new AppError('Failed to fetch organizations', 500);
    }

    const memberships = (membershipData ?? []) as MembershipRow[];
    if (memberships.length === 0) {
      res.json({ organizations: [] });
      return;
    }

    const organizationIds = Array.from(new Set(memberships.map((row) => row.organization_id)));

    const { data: orgData, error: orgError } = await db
      .from('organizations')
      .select('id, name, slug, created_by, created_at, updated_at')
      .in('id', organizationIds);

    if (orgError) {
      logger.error(
        { error: orgError, userId: user.userId },
        'Failed to fetch enterprise organizations',
      );
      throw new AppError('Failed to fetch organizations', 500);
    }

    const orgById = new Map<string, OrganizationRow>(
      ((orgData ?? []) as OrganizationRow[]).map((org) => [org.id, org]),
    );

    const organizations = memberships
      .map((row) => {
        const org = orgById.get(row.organization_id);
        if (!org) return null;
        return {
          id: org.id,
          name: org.name,
          slug: org.slug,
          createdBy: org.created_by,
          createdAt: org.created_at,
          updatedAt: org.updated_at,
          membership: {
            role: row.role,
            joinedAt: row.joined_at,
          },
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    res.json({ organizations });
  },
);

router.get(
  '/organizations/:orgId/policy',
  createRateLimiter('enterprise-policy'),
  async (req: Request, res: Response) => {
    const user = requireUser(req);
    const { orgId } = uuidParamSchema.parse(req.params);
    const db = getUserScopedClient(user);

    await requireMembershipRole(db, orgId, user.userId, 'member');

    const row = await fetchPolicyRow(db, orgId);

    res.json({ policy: mapPolicy(row, orgId) });
  },
);

router.get(
  '/organizations/:orgId/audit-events',
  createRateLimiter('enterprise-audit-events'),
  async (req: Request, res: Response) => {
    const user = requireUser(req);
    const { orgId } = uuidParamSchema.parse(req.params);
    const { limit } = auditQuerySchema.parse(req.query);
    const db = getUserScopedClient(user);

    await requireMembershipRole(db, orgId, user.userId, 'admin');

    const { data, error } = await db
      .from('enterprise_audit_events')
      .select(
        `
        id,
        organization_id,
        actor_user_id,
        surface,
        action,
        resource_type,
        resource_id,
        outcome,
        severity,
        metadata,
        created_at
      `,
      )
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error({ error, orgId, userId: user.userId }, 'Failed to fetch audit events');
      throw new AppError('Failed to fetch audit events', 500);
    }

    res.json({ events: data ?? [], limit });
  },
);

router.get(
  '/organizations/:orgId/audit-events/export',
  createRateLimiter('enterprise-audit-events'),
  async (req: Request, res: Response) => {
    const user = requireUser(req);
    const { orgId } = uuidParamSchema.parse(req.params);
    const query = auditExportQuerySchema.parse(req.query);
    const db = getUserScopedClient(user);

    await requireMembershipRole(db, orgId, user.userId, 'admin');

    const policy = mapPolicy(await fetchPolicyRow(db, orgId), orgId);
    if (!policy.auditExportEnabled) {
      res.status(403).json({
        error: 'Audit export is disabled for this organization',
        code: 'AUDIT_EXPORT_DISABLED',
      });
      return;
    }

    const windowEnd = query.to ?? new Date().toISOString();

    let builder = db
      .from('enterprise_audit_events')
      .select(AUDIT_EXPORT_COLUMNS.join(', '))
      .eq('organization_id', orgId)
      .lte('created_at', windowEnd);

    if (query.from) {
      builder = builder.gte('created_at', query.from);
    }

    const { data, error } = await builder
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(query.offset, query.offset + query.limit);

    if (error) {
      logger.error({ error, orgId, userId: user.userId }, 'Failed to export audit events');
      throw new AppError('Failed to export audit events', 500);
    }

    const fetched = (data ?? []) as AuditEventRow[];
    const hasMore = fetched.length > query.limit;
    const rows = hasMore ? fetched.slice(0, query.limit) : fetched;

    const extension = query.format === 'csv' ? 'csv' : 'jsonl';
    const filename = `audit-events-${orgId}-${windowEnd.replace(/[:.]/g, '-')}.${extension}`;

    res.setHeader(
      'Content-Type',
      query.format === 'csv' ? 'text/csv; charset=utf-8' : 'application/x-ndjson; charset=utf-8',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Audit-Export-Window-End', windowEnd);
    res.setHeader('X-Audit-Export-Row-Count', String(rows.length));
    if (hasMore) {
      res.setHeader('X-Audit-Export-Next-Offset', String(query.offset + rows.length));
    }

    try {
      const { error: auditError } = await db.rpc('record_enterprise_audit_event', {
        p_organization_id: orgId,
        p_actor_user_id: user.userId,
        p_surface: 'gateway',
        p_action: 'data_exported',
        p_resource_type: 'enterprise_audit_events',
        p_resource_id: null,
        p_outcome: 'success',
        p_severity: 'info',
        p_metadata: JSON.stringify({
          format: query.format,
          from: query.from ?? null,
          to: windowEnd,
          offset: query.offset,
          count: rows.length,
        }),
      });
      if (auditError) {
        logger.error({ error: auditError, orgId }, 'Failed to record audit export event');
      }
    } catch (auditError) {
      logger.error({ error: auditError, orgId }, 'Failed to record audit export event');
    }

    res.send(query.format === 'csv' ? toCsv(rows, query.offset === 0) : toJsonl(rows));
  },
);

router.get(
  '/organizations/:orgId/usage-ledger',
  createRateLimiter('enterprise-usage-ledger'),
  async (req: Request, res: Response) => {
    const user = requireUser(req);
    const { orgId } = uuidParamSchema.parse(req.params);
    const membershipDb = getUserScopedClient(user);

    await requireMembershipRole(membershipDb, orgId, user.userId, 'admin');

    res.status(410).json({
      error: 'Detailed usage ledger is no longer available',
      code: 'PERCENTAGE_USAGE_REQUIRED',
      usage_url: '/api/credits/balance',
    });
  },
);

router.post(
  '/organizations/:orgId/support-cases',
  createRateLimiter('enterprise-support-case'),
  async (req: Request, res: Response) => {
    const user = requireUser(req);
    const { orgId } = uuidParamSchema.parse(req.params);
    const body = supportCaseSchema.parse(req.body);
    const db = getUserScopedClient(user);

    await requireMembershipRole(db, orgId, user.userId, 'member');

    const { data, error } = await db
      .from('support_cases')
      .insert({
        organization_id: orgId,
        requester_user_id: user.userId,
        subject: body.subject,
        description: body.description,
        severity: body.severity,
        status: 'open',
        privacy_label: body.privacyLabel,
      })
      .select('id, status, created_at')
      .single();

    if (error) {
      logger.error({ error, orgId, userId: user.userId }, 'Failed to create support case');
      throw new AppError('Failed to create support case', 500);
    }

    const row = data as { id: string; status: SupportCase['status']; created_at: string };
    res.status(201).json({
      case: {
        id: row.id,
        status: row.status,
        createdAt: row.created_at,
      },
    });
  },
);

export { router as enterpriseRouter };
