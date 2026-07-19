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
import { getSystemClient, getUserScopedClient, type CloudDbClient } from '../lib/neonClients';
import { logger } from '../lib/logger';

const router: Router = Router();

// Rate-limit BEFORE authentication so a flood of unauthenticated requests is
// throttled before it reaches JWT verification + the per-route membership/DB
// lookups. Registering the limiter ahead of `authenticateToken` also makes it
// guard the authorization middleware (CodeQL js/missing-rate-limiting). The
// per-route limiters below key by userId (post-auth); this router-level default
// keys by IP since req.user is not yet populated here.
router.use(createRateLimiter('default'));
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

    // P1-GW-ENT: the Neon query layer (lib/neonClients.assertColumnList)
    // collapses any select containing `(` to `SELECT *`, so the PostgREST
    // resource-embedding syntax `organization:organizations ( … )` never
    // returns a joined `organization` object — every row was dropped by the
    // downstream `.filter`. Fetch memberships, then the organizations they
    // reference, in two explicit queries and stitch them in JS.
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
    const membershipDb = getUserScopedClient(user);
    const db = getSystemClient('shadow-schema-compatibility');

    await requireMembershipRole(membershipDb, orgId, user.userId, 'member');

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
    const membershipDb = getUserScopedClient(user);
    const db = getSystemClient('shadow-schema-compatibility');

    await requireMembershipRole(membershipDb, orgId, user.userId, 'admin');

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
    const membershipDb = getUserScopedClient(user);
    const db = getSystemClient('shadow-schema-compatibility');

    await requireMembershipRole(membershipDb, orgId, user.userId, 'member');

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
