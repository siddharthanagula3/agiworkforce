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

const INSERT_APPLICATION = `insert into public.beta_applications
       (email, full_name, role, company, surfaces, use_case, discord_handle, user_id, source)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`;

/**
 * One application per address. An application from a signed-in account is
 * submitted under that account's own verified address, so it may update the
 * address's earlier row, but only while that row belongs to nobody or to the
 * same account, and it never replaces a row's account. A row already reviewed
 * keeps its decision, resubmitting must not reset a rejection to pending or
 * discard the reviewer's note. An anonymous submission proves nothing about the
 * address, so it can only create the row: it neither overwrites an existing
 * application nor learns what became of it.
 */
export async function recordBetaApplication(input: BetaApplicationInput): Promise<{
  alreadyReviewed: boolean;
}> {
  const params = [
    input.email,
    input.fullName,
    input.role,
    input.company,
    input.surfaces,
    input.useCase,
    input.discordHandle,
    input.userId,
    input.source,
  ];

  if (input.userId === null) {
    await getNeonDb().query(`${INSERT_APPLICATION} on conflict (lower(email)) do nothing`, params);
    return { alreadyReviewed: false };
  }

  const rows = await getNeonDb().query<{ status: string }>(
    `${INSERT_APPLICATION}
     on conflict (lower(email)) do update
        set full_name     = excluded.full_name,
            role          = excluded.role,
            company       = excluded.company,
            surfaces      = excluded.surfaces,
            use_case      = excluded.use_case,
            discord_handle = excluded.discord_handle,
            user_id       = coalesce(public.beta_applications.user_id, excluded.user_id),
            source        = coalesce(excluded.source, public.beta_applications.source),
            updated_at    = now()
      where public.beta_applications.user_id is null
         or public.beta_applications.user_id = excluded.user_id
      returning status`,
    params,
  );

  return { alreadyReviewed: (rows[0]?.status ?? 'pending') !== 'pending' };
}
