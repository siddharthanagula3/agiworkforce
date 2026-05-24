import 'server-only';

import { getNeonDb } from '@/lib/server/neon-db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveClerkId(supabaseUuid: string): Promise<string | null> {
  const db = getNeonDb();
  const [row] = await db.query<{ clerk_id: string }>(
    'select clerk_id from user_id_mapping where supabase_uuid = $1 limit 1',
    [supabaseUuid],
  );
  return row?.clerk_id ?? null;
}

export async function resolveUserId(rawId: string): Promise<string> {
  if (rawId.startsWith('user_')) return rawId;
  if (UUID_RE.test(rawId)) {
    const clerkId = await resolveClerkId(rawId);
    if (!clerkId) throw new Error(`No Clerk mapping for Supabase UUID ${rawId}`);
    return clerkId;
  }
  return rawId;
}
