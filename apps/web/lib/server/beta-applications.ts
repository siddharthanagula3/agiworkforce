import 'server-only';

import { getNeonDb } from '@/lib/server/neon-db';

export const BETA_ROLES = [
  'Software engineering',
  'Data science / ML',
  'Product management',
  'Design / UX',
  'Operations',
  'Research / Academia',
  'Student',
  'Other',
] as const;

export const BETA_SURFACES = ['web', 'desktop', 'mobile', 'chrome', 'vscode', 'cli'] as const;

export const MAX_USE_CASE_LENGTH = 1500;

const PG_UNDEFINED_TABLE = '42P01';

/** True only when migration 0131 has not been applied. */
export function isIntakeTableMissing(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  return (
    record['code'] === PG_UNDEFINED_TABLE ||
    /relation .*beta_applications.* does not exist/.test(String(record['message'] ?? ''))
  );
}

export type BetaSurface = (typeof BETA_SURFACES)[number];

export interface BetaApplicationInput {
  email: string;
  fullName: string;
  role: string;
  company: string | null;
  surfaces: BetaSurface[];
  useCase: string | null;
  discordHandle: string | null;
  userId: string | null;
  source: string | null;
}

export function isBetaSurface(value: unknown): value is BetaSurface {
  return typeof value === 'string' && (BETA_SURFACES as readonly string[]).includes(value);
}

export async function recordBetaApplication(input: BetaApplicationInput): Promise<{
  alreadyReviewed: boolean;
}> {
  const rows = await getNeonDb().query<{ status: string }>(
    `insert into public.beta_applications
       (email, full_name, role, company, surfaces, use_case, discord_handle, user_id, source)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (lower(email)) do update
        set full_name     = excluded.full_name,
            role          = excluded.role,
            company       = excluded.company,
            surfaces      = excluded.surfaces,
            use_case      = excluded.use_case,
            discord_handle = excluded.discord_handle,
            user_id       = coalesce(excluded.user_id, public.beta_applications.user_id),
            source        = coalesce(excluded.source, public.beta_applications.source),
            updated_at    = now()
      returning status`,
    [
      input.email,
      input.fullName,
      input.role,
      input.company,
      input.surfaces,
      input.useCase,
      input.discordHandle,
      input.userId,
      input.source,
    ],
  );

  return { alreadyReviewed: (rows[0]?.status ?? 'pending') !== 'pending' };
}
