import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { creditsFromMicrousd } from '@agiworkforce/types';

import type { DeveloperUsage, DeveloperUsageFigures } from '@/features/developers/types';
import { SETTLED, UNSETTLED, num } from '@/lib/services/usage-aggregation';

export interface DeveloperUsageWindow {
  from: string;
  to: string;
}

interface KeyUsageRow {
  api_key_id: string;
  project_id: string | null;
  requests: string | number | null;
  cost_microusd: string | number | null;
  unsettled: string | number | null;
}

export function developerUsageMonth(now: Date = new Date()): DeveloperUsageWindow {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return {
    from: new Date(Date.UTC(year, month, 1)).toISOString(),
    to: new Date(Date.UTC(year, month + 1, 1)).toISOString(),
  };
}

function addUsage(target: DeveloperUsageFigures, row: DeveloperUsageFigures): void {
  target.requests += row.requests;
  target.credits += row.credits;
  target.unsettledRequests += row.unsettledRequests;
}

export async function readDeveloperUsage(
  db: DatabaseAdapter,
  userId: string,
  window: DeveloperUsageWindow,
): Promise<DeveloperUsage> {
  const rows = await db.query<KeyUsageRow>(
    `select r.api_key_id,
            k.project_id,
            count(*) filter (where ${SETTLED})::int as requests,
            coalesce(sum(r.actual_cost_microusd) filter (where ${SETTLED}), 0)::bigint as cost_microusd,
            count(*) filter (where ${UNSETTLED})::int as unsettled
       from public.managed_usage_requests r
       join public.api_keys k
         on k.id = r.api_key_id
        and k.user_id = r.user_id
      where r.user_id = $1
        and r.api_key_id is not null
        and r.created_at >= $2
        and r.created_at < $3
      group by r.api_key_id, k.project_id`,
    [userId, window.from, window.to],
  );

  const keys: DeveloperUsage['keys'] = [];
  const projects = new Map<string | null, DeveloperUsage['projects'][number]>();
  for (const row of rows) {
    const usage: DeveloperUsageFigures = {
      requests: num(row.requests),
      credits: creditsFromMicrousd(num(row.cost_microusd)),
      unsettledRequests: num(row.unsettled),
    };
    keys.push({ apiKeyId: row.api_key_id, ...usage });
    const project = projects.get(row.project_id) ?? {
      projectId: row.project_id,
      requests: 0,
      credits: 0,
      unsettledRequests: 0,
    };
    addUsage(project, usage);
    projects.set(row.project_id, project);
  }

  return { ...window, keys, projects: [...projects.values()] };
}

export async function developerProjectSpendMicrousd(
  db: DatabaseAdapter,
  userId: string,
  projectId: string,
  window: DeveloperUsageWindow,
): Promise<number> {
  const [row] = await db.query<{ spent: string | number | null }>(
    `select coalesce(sum(
              case
                when ${SETTLED} then coalesce(r.actual_cost_microusd, 0)
                when ${UNSETTLED} then coalesce(r.estimated_cost_microusd, 0)
                else 0
              end
            ), 0)::bigint as spent
       from public.managed_usage_requests r
       join public.api_keys k
         on k.id = r.api_key_id
        and k.user_id = r.user_id
      where r.user_id = $1
        and k.project_id = $2
        and r.created_at >= $3
        and r.created_at < $4`,
    [userId, projectId, window.from, window.to],
  );
  return num(row?.spent);
}
