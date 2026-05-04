import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withRateLimit } from '@/lib/rate-limit';
import { handleCorsPreflightRequest, getCorsHeaders } from '@/lib/cors';
import { requireEnv } from '@/utils/env';

/**
 * GET /api/control-plane/status
 *
 * Returns cross-surface operational status for the dashboard control-plane hero.
 * Surfaces (desktop, mobile, extension, CLI) are detected via last-heartbeat
 * timestamps stored in Supabase. Agent activity and provider health are derived
 * from available Supabase data.
 */

export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// Singleton service-role client - stateless, safe to reuse across requests
// ---------------------------------------------------------------------------

let _serviceClient: ReturnType<typeof createClient> | null = null;

function getServiceClient() {
  if (!_serviceClient) {
    const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
    const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    _serviceClient = createClient(url, key, {
      auth: { persistSession: false },
    });
  }
  return _serviceClient;
}

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

async function authenticateRequest(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    // Reuse singleton service-role client for Bearer token validation
    const {
      data: { user },
      error,
    } = await getServiceClient().auth.getUser(token);
    if (error || !user) return null;
    return user.id;
  }

  // Cookie-based auth for browser requests
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const { createServerClient } = await import('@supabase/ssr');
  const ssrClient = createServerClient(supabaseUrl, requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // read-only for this route
      },
    },
  });
  const {
    data: { user },
  } = await ssrClient.auth.getUser();
  return user?.id ?? null;
}

export async function GET(request: NextRequest) {
  // Rate limit: use 'health-check' bucket (30 req/min) - appropriate for polling
  const rateLimitResponse = await withRateLimit(request, 'health-check');
  if (rateLimitResponse) return rateLimitResponse;

  const userId = await authenticateRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Reuse the module-level singleton service client
  const untypedClient =
    getServiceClient() as unknown as import('@supabase/supabase-js').SupabaseClient;

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
    const { data: heartbeats } = await untypedClient
      .from('surface_heartbeats')
      .select('surface_id, last_seen_at')
      .eq('user_id', userId);

    if (heartbeats && Array.isArray(heartbeats)) {
      const ONLINE_MS = 5 * 60 * 1000; // 5 min
      const OFFLINE_MS = 60 * 60 * 1000; // 1 hr - beyond this still "offline"
      const now = Date.now();

      for (const hb of heartbeats as Array<{ surface_id: string; last_seen_at: string }>) {
        const idx = surfaces.findIndex((s) => s.id === hb.surface_id);
        if (idx === -1) continue;
        const diff = now - new Date(hb.last_seen_at).getTime();
        const status: SurfaceStatus =
          diff < ONLINE_MS ? 'online' : diff < OFFLINE_MS ? 'offline' : 'offline';
        surfaces[idx] = { ...surfaces[idx]!, status, lastSeen: hb.last_seen_at };
      }
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

    const [runningRes, pendingRes, completedRes] = await Promise.all([
      untypedClient
        .from('agent_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'running'),
      untypedClient
        .from('agent_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'pending_approval'),
      untypedClient
        .from('agent_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'completed')
        .gte('completed_at', todayStart.toISOString()),
    ]);

    agents = {
      running: (runningRes as { count: number | null }).count ?? 0,
      pendingApprovals: (pendingRes as { count: number | null }).count ?? 0,
      completedToday: (completedRes as { count: number | null }).count ?? 0,
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
    const { data: activityData } = await untypedClient
      .from('surface_activity_log')
      .select('id, surface_id, action_label, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (activityData && Array.isArray(activityData)) {
      recentActivity = (
        activityData as Array<{
          id: string;
          surface_id: string;
          action_label: string;
          created_at: string;
        }>
      ).map((row) => ({
        id: row.id,
        surface: (row.surface_id as SurfaceId) ?? 'desktop',
        action: row.action_label,
        timestamp: row.created_at,
      }));
    }
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
