import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest, getCorsHeaders } from '@/lib/cors';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { logger } from '@/lib/logger';

/**
 * GET /api/control-plane/status
 *
 * Returns cross-surface operational status for the dashboard control-plane hero.
 * Surface activity is derived from canonical device records. Agent activity
 * comes from the durable cloud-run journal; provider health uses live probes.
 */

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

// Provider probes - fast HEAD requests with a 4 s timeout
const PROVIDER_PROBES: Array<{ name: string; url: string }> = [
  { name: 'Anthropic', url: 'https://anthropic.com' },
  { name: 'OpenAI', url: 'https://openai.com' },
  { name: 'Google', url: 'https://generativelanguage.googleapis.com' },
];

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
  // Rate limit: use 'health-check' bucket (30 req/min) - appropriate for polling
  const rateLimitResponse = await withRateLimit(request, 'health-check');
  if (rateLimitResponse) return rateLimitResponse;

  let userId: string;
  try {
    const authResult = await getClerkAuthUser(request);
    userId = authResult.userId;
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getNeonDb();

  // ---------------------------------------------------------------------------
  // 1. Surface activity from canonical device records
  // ---------------------------------------------------------------------------
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

    const ONLINE_MS = 5 * 60 * 1000; // 5 min
    const OFFLINE_MS = 60 * 60 * 1000; // 1 hr - beyond this still "offline"
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
    // This dashboard widget is non-critical; retain unknown states on failure.
    logger.warn(
      { err, userId, route: 'GET /api/control-plane/status', section: 'surface_activity' },
      'Failed to fetch surface activity; surfaces remain unknown',
    );
  }

  // ---------------------------------------------------------------------------
  // 2. Agent activity counts
  // ---------------------------------------------------------------------------
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
    // This dashboard widget is non-critical; retain zeros on failure.
    logger.warn(
      { err, userId, route: 'GET /api/control-plane/status', section: 'agent_activity' },
      'Failed to fetch agent activity counts; defaulting to zeros',
    );
  }

  // ---------------------------------------------------------------------------
  // 3. Provider health probes (parallel)
  // ---------------------------------------------------------------------------
  const providerResults = await Promise.all(
    PROVIDER_PROBES.map((p) => probeProvider(p.name, p.url)),
  );

  // ---------------------------------------------------------------------------
  // 4. Recent activity feed
  // ---------------------------------------------------------------------------
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
    // This dashboard widget is non-critical; retain an empty feed on failure.
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
