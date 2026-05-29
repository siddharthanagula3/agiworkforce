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
import { getUserScopedClient } from '../lib/neonClients';
import { logger } from '../lib/logger';

const router: Router = Router();

router.use(authenticateToken);

const uuidParamSchema = z.object({
  orgId: z.uuid(),
});

const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const supportCaseSchema = z.object({
  subject: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(5000),
  severity: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  privacyLabel: z
    .enum(['local_only', 'byok', 'managed', 'security_sensitive'])
    .default('security_sensitive'),
});

interface OrganizationMembershipRow {
  organization_id: string;
  role: OrganizationRole;
  joined_at: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    created_by: string;
    created_at: string;
    updated_at: string;
  } | null;
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

async function getMembershipRole(
  db: ReturnType<typeof getUserScopedClient>,
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
  db: ReturnType<typeof getUserScopedClient>,
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
    const db = getUserScopedClient(user.userId);

    const { data, error } = await db
      .from('organization_members')
      .select(
        `
        organization_id,
        role,
        joined_at,
        organization:organizations (
          id,
          name,
          slug,
          created_by,
          created_at,
          updated_at
        )
      `,
      )
      .eq('user_id', user.userId)
      .order('joined_at', { ascending: false });

    if (error) {
      logger.error({ error, userId: user.userId }, 'Failed to fetch enterprise organizations');
      throw new AppError('Failed to fetch organizations', 500);
    }

    const organizations = ((data ?? []) as unknown as OrganizationMembershipRow[])
      .filter((row) => row.organization)
      .map((row) => ({
        id: row.organization?.id,
        name: row.organization?.name,
        slug: row.organization?.slug,
        createdBy: row.organization?.created_by,
        createdAt: row.organization?.created_at,
        updatedAt: row.organization?.updated_at,
        membership: {
          role: row.role,
          joinedAt: row.joined_at,
        },
      }));

    res.json({ organizations });
  },
);

router.get(
  '/organizations/:orgId/policy',
  createRateLimiter('enterprise-policy'),
  async (req: Request, res: Response) => {
    const user = requireUser(req);
    const { orgId } = uuidParamSchema.parse(req.params);
    const db = getUserScopedClient(user.userId);

    await requireMembershipRole(db, orgId, user.userId, 'member');

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
      .eq('organization_id', orgId)
      .maybeSingle();

    if (error) {
      logger.error({ error, orgId, userId: user.userId }, 'Failed to fetch enterprise policy');
      throw new AppError('Failed to fetch policy', 500);
    }

    res.json({ policy: mapPolicy((data as EnterprisePolicyRow | null) ?? null, orgId) });
  },
);

router.get(
  '/organizations/:orgId/audit-events',
  createRateLimiter('enterprise-audit-events'),
  async (req: Request, res: Response) => {
    const user = requireUser(req);
    const { orgId } = uuidParamSchema.parse(req.params);
    const { limit } = auditQuerySchema.parse(req.query);
    const db = getUserScopedClient(user.userId);

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
  '/organizations/:orgId/usage-ledger',
  createRateLimiter('enterprise-usage-ledger'),
  async (req: Request, res: Response) => {
    const user = requireUser(req);
    const { orgId } = uuidParamSchema.parse(req.params);
    const { limit } = auditQuerySchema.parse(req.query);
    const db = getUserScopedClient(user.userId);

    await requireMembershipRole(db, orgId, user.userId, 'admin');

    const { data, error } = await db
      .from('organization_usage_ledger')
      .select(
        `
        id,
        organization_id,
        user_id,
        privacy_mode,
        provider,
        model,
        input_tokens,
        output_tokens,
        provider_cost_usd,
        charged_amount_usd,
        gross_margin_usd,
        gross_margin_pct,
        created_at
      `,
      )
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error({ error, orgId, userId: user.userId }, 'Failed to fetch usage ledger');
      throw new AppError('Failed to fetch usage ledger', 500);
    }

    res.json({ entries: data ?? [], limit });
  },
);

router.post(
  '/organizations/:orgId/support-cases',
  createRateLimiter('enterprise-support-case'),
  async (req: Request, res: Response) => {
    const user = requireUser(req);
    const { orgId } = uuidParamSchema.parse(req.params);
    const body = supportCaseSchema.parse(req.body);
    const db = getUserScopedClient(user.userId);

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
