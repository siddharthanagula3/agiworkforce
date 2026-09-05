import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest, getCorsHeaders } from '@/lib/cors';
import { unauthorizedResponseFor } from '@/lib/api-auth-response';
import { isMfaRequiredError } from '@/lib/mfa-policy-gate';
import { isIpNotAllowedError } from '@/lib/ip-allow-list-gate';
import { getUserScopedDb, type UserScopedDb } from '@/lib/server/rls-db';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

type SurfaceId = 'desktop' | 'mobile' | 'extension' | 'cli';
type SurfaceStatus = 'online' | 'offline' | 'unknown';
type ProviderStatusVal = 'up' | 'degraded' | 'down';

interface SurfaceRow {
  id: SurfaceId;
  status: SurfaceStatus;
  lastSeen: string | null;
}

interface ProviderRow {
  name: string;
  status: ProviderStatusVal;
  latencyMs: number | null;
}

interface ActivityRow {
  id: string;
  surface: SurfaceId;
  action: string;
  timestamp: string;
}

interface ControlPlaneResponse {
  surfaces: SurfaceRow[];
  agents: { running: number; pendingApprovals: number; completedToday: number };
  providers: ProviderRow[];
  recentActivity: ActivityRow[];
}

const PROVIDER_PROBES: Array<{ name: string; url: string }> = [
  { name: 'Anthropic', url: 'https://anthropic.com' },
  { name: 'OpenAI', url: 'https://openai.com' },
  { name: 'Google', url: 'https://generativelanguage.googleapis.com' },
];

const SURFACE_SCOPE = { resolveOrganization: false } as const;

async function probeProvider(name: string, url: string): Promise<ProviderRow> {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(4000),
    });
    const latencyMs = Date.now() - start;
    return {
      name,
      status: res.status < 500 ? 'up' : 'degraded',
      latencyMs,
    };
  } catch {
    return { name, status: 'down', latencyMs: null };
  }
}

export async function GET(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'health-check');
  if (rateLimitResponse) return rateLimitResponse;

  let scoped: UserScopedDb;
  try {
    scoped = await getUserScopedDb(request, SURFACE_SCOPE);
  } catch (authError) {
    if (isMfaRequiredError(authError) || isIpNotAllowedError(authError)) {
      return unauthorizedResponseFor(authError);
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { db, userId } = scoped;

  const surfaces: SurfaceRow[] = [
    { id: 'desktop', status: 'unknown', lastSeen: null },
    { id: 'mobile', status: 'unknown', lastSeen: null },
    { id: 'extension', status: 'unknown', lastSeen: null },
    { id: 'cli', status: 'unknown', lastSeen: null },
  ];

  try {
    const heartbeats = await db.query<{ surface_id: string; last_seen_at: string }>(
      `
        select 'desktop'::text as surface_id, max(last_seen_at)::text as last_seen_at
          from desktop_devices
         where user_id = $1
        union all
        select 'mobile'::text as surface_id, max(updated_at)::text as last_seen_at
          from mobile_devices
         where user_id = $1
      `,
      [userId],
    );

    const ONLINE_MS = 5 * 60 * 1000;
    const OFFLINE_MS = 60 * 60 * 1000;
    const now = Date.now();

    for (const hb of heartbeats) {
      if (!hb.last_seen_at) continue;
      const idx = surfaces.findIndex((s) => s.id === hb.surface_id);
      if (idx === -1) continue;
      const diff = now - new Date(hb.last_seen_at).getTime();
      const status: SurfaceStatus =
        diff < ONLINE_MS ? 'online' : diff < OFFLINE_MS ? 'offline' : 'offline';
      surfaces[idx] = { ...surfaces[idx]!, status, lastSeen: hb.last_seen_at };
    }
  } catch (err) {
    logger.warn(
      { err, userId, route: 'GET /api/control-plane/status', section: 'surface_activity' },
      'Failed to fetch surface activity; surfaces remain unknown',
    );
  }

  let agents = { running: 0, pendingApprovals: 0, completedToday: 0 };

  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [runningRows, pendingRows, completedRows] = await Promise.all([
      db.query<{ cnt: string }>(
        "select count(*) as cnt from cloud_agent_runs where user_id = $1 and state = 'running'",
        [userId],
      ),
      db.query<{ cnt: string }>(
        "select count(*) as cnt from cloud_agent_approval_checkpoints where user_id = $1 and state = 'pending'",
        [userId],
      ),
      db.query<{ cnt: string }>(
        "select count(*) as cnt from cloud_agent_runs where user_id = $1 and state = 'completed' and completed_at >= $2",
        [userId, todayStart.toISOString()],
      ),
    ]);

    agents = {
      running: parseInt(runningRows[0]?.cnt ?? '0', 10),
      pendingApprovals: parseInt(pendingRows[0]?.cnt ?? '0', 10),
      completedToday: parseInt(completedRows[0]?.cnt ?? '0', 10),
    };
  } catch (err) {
    logger.warn(
      { err, userId, route: 'GET /api/control-plane/status', section: 'agent_activity' },
      'Failed to fetch agent activity counts; defaulting to zeros',
    );
  }

  const providerResults = await Promise.all(
    PROVIDER_PROBES.map((p) => probeProvider(p.name, p.url)),
  );

  let recentActivity: ActivityRow[] = [];

  try {
    const activityData = await db.query<{
      id: string;
      surface_id: string;
      action_label: string;
      created_at: string;
    }>(
      `
        select event.id::text as id,
               case
                 when run.origin_surface = 'vscode' then 'extension'
                 else run.origin_surface
               end as surface_id,
               event.event_type as action_label,
               event.created_at::text as created_at
          from cloud_agent_events as event
          join cloud_agent_runs as run on run.id = event.run_id
         where run.user_id = $1
           and run.origin_surface in ('desktop', 'mobile', 'vscode')
         order by event.created_at desc
         limit 10
      `,
      [userId],
    );

    recentActivity = activityData.map((row) => ({
      id: row.id,
      surface: (row.surface_id as SurfaceId) ?? 'desktop',
      action: row.action_label,
      timestamp: row.created_at,
    }));
  } catch (err) {
    logger.warn(
      { err, userId, route: 'GET /api/control-plane/status', section: 'recent_activity' },
      'Failed to fetch recent activity feed; returning empty',
    );
  }

  const response: ControlPlaneResponse = {
    surfaces,
    agents,
    providers: providerResults,
    recentActivity,
  };

  return NextResponse.json(response, {
    status: 200,
    headers: {
      ...getCorsHeaders(request),
      'Cache-Control': 'no-store',
    },
  });
}

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}
