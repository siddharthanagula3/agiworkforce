import 'server-only';

import { NextResponse } from 'next/server';
import { formatCredits, microusdFromCredits } from '@agiworkforce/types';

import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  developerProjectSpendMicrousd,
  developerUsageMonth,
} from '@/lib/services/developer-usage-service';
import { queueDeveloperWebhookEvent } from '@/lib/services/developer-webhook-service';

interface CappedProjectRow {
  id: string;
  name: string;
  monthly_credit_limit: string | number;
}

const RESET_DATE = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export async function developerProjectSpendRefusal(
  credential: { userId: string; apiKeyId: string },
  headers: Record<string, string> = {},
): Promise<NextResponse | null> {
  const db = createClaimedUserScopedDb(getNeonDb(), {
    userId: credential.userId,
    organizationId: null,
  });
  const [project] = await db.query<CappedProjectRow>(
    `select p.id, p.name, p.monthly_credit_limit
       from public.api_keys k
       join public.developer_projects p
         on p.id = k.project_id
        and p.user_id = k.user_id
      where k.id = $1
        and k.user_id = $2
        and p.monthly_credit_limit is not null
      limit 1`,
    [credential.apiKeyId, credential.userId],
  );
  if (!project) return null;

  const limit = Number(project.monthly_credit_limit);
  const window = developerUsageMonth();
  const spent = await developerProjectSpendMicrousd(db, credential.userId, project.id, window);
  if (spent < microusdFromCredits(limit)) return null;

  const [announced] = await db.query<{ id: string }>(
    `select id
       from public.developer_webhook_deliveries
      where user_id = $1
        and event_type = 'project.spend_limit_reached'
        and payload->'data'->>'project_id' = $2
        and created_at >= $3
      limit 1`,
    [credential.userId, project.id, window.from],
  );
  if (!announced) {
    await queueDeveloperWebhookEvent(db, credential.userId, 'project.spend_limit_reached', {
      project_id: project.id,
      name: project.name,
      monthly_credit_limit: limit,
      reset_at: window.to,
    });
  }

  return NextResponse.json(
    {
      error: {
        message: `The ${project.name} project has reached its monthly limit of ${formatCredits(limit)}. Raise the limit in the developer console, or wait until it resets on ${RESET_DATE.format(new Date(window.to))}.`,
        type: 'insufficient_quota',
        code: 'project_spend_limit_reached',
        project_id: project.id,
        reset_at: window.to,
      },
    },
    { status: 429, headers },
  );
}
