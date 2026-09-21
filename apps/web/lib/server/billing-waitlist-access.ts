import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

export async function hasBillingWaitlistAccess(
  db: DatabaseAdapter,
  userId: string,
): Promise<boolean> {
  const [row] = await db.query<{ granted: boolean }>(
    `select exists(
       select 1 from beta_redemptions where user_id = $1
     ) as granted`,
    [userId],
  );
  return row?.granted === true;
}
