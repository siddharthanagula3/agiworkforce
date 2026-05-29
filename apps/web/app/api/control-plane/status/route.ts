import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest, getCorsHeaders } from '@/lib/cors';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';

/**
 * GET /api/control-plane/status
 *
 * Returns cross-surface operational status for the dashboard control-plane hero.
 * Surfaces (desktop, mobile, extension, CLI) are detected via last-heartbeat
 * timestamps stored in Neon. Agent activity and provider health are derived
 * from available data.
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
  // 1. Surface heartbeats
  // ---------------------------------------------------------------------------
  const surfaces: SurfaceRow[] = [
    { id: 'desktop', status: 'unknown', lastSeen: null },
    { id: 'mobile', status: 'unknown', lastSeen: null },
    { id: 'extension', status: 'unknown', lastSeen: null },
    { id: 'cli', status: 'unknown', lastSeen: null },
  ];

  try {
    const heartbeats = await db.query<{ surface_id: string; last_seen_at: string }>(
      'select surface_id, last_seen_at from surface_heartbeats where user_id = $1',
      [userId],
    );

    const ONLINE_MS = 5 * 60 * 1000; // 5 min
    const OFFLINE_MS = 60 * 60 * 1000; // 1 hr - beyond this still "offline"
    const now = Date.now();

    for (const hb of heartbeats) {
      const idx = surfaces.findIndex((s) => s.id === hb.surface_id);
      if (idx === -1) continue;
      const diff = now - new Date(hb.last_seen_at).getTime();
      const status: SurfaceStatus =
        diff < ONLINE_MS ? 'online' : diff < OFFLINE_MS ? 'offline' : 'offline';
      surfaces[idx] = { ...surfaces[idx]!, status, lastSeen: hb.last_seen_at };
    }
  } catch {
    // Table not yet created - all surfaces remain 'unknown'
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
        "select count(*) as cnt from agent_tasks where user_id = $1 and status = 'running'",
        [userId],
      ),
      db.query<{ cnt: string }>(
        "select count(*) as cnt from agent_tasks where user_id = $1 and status = 'pending_approval'",
        [userId],
      ),
      db.query<{ cnt: string }>(
        "select count(*) as cnt from agent_tasks where user_id = $1 and status = 'completed' and completed_at >= $2",
        [userId, todayStart.toISOString()],
      ),
    ]);

    agents = {
      running: parseInt(runningRows[0]?.cnt ?? '0', 10),
      pendingApprovals: parseInt(pendingRows[0]?.cnt ?? '0', 10),
      completedToday: parseInt(completedRows[0]?.cnt ?? '0', 10),
    };
  } catch {
    // Table not yet created - return zeros
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
      'select id, surface_id, action_label, created_at from surface_activity_log where user_id = $1 order by created_at desc limit 10',
      [userId],
    );

    recentActivity = activityData.map((row) => ({
      id: row.id,
      surface: (row.surface_id as SurfaceId) ?? 'desktop',
      action: row.action_label,
      timestamp: row.created_at,
    }));
  } catch {
    // Table not yet created - empty feed
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
