import 'server-only';

import { z } from 'zod';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { checkContentFilter } from '@agiworkforce/types';

const SafetyDocumentSchema = z
  .object({
    safety: z
      .object({
        reduceSensitiveContent: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const REDUCED_SENSITIVE_CONTENT_WEB_REFUSAL =
  'This content is unavailable while Reduce sensitive content is on. You can change this in Settings > Safety.';

export class ManagedContentSafetyPolicyError extends Error {
  constructor(message = 'Managed content safety preferences are unavailable') {
    super(message);
    this.name = 'ManagedContentSafetyPolicyError';
  }
}

export async function loadManagedContentSafetyPreference(
  db: DatabaseAdapter,
  userId: string,
): Promise<boolean> {
  let rows: Array<{ settings: unknown }>;
  try {
    rows = await db.query<{ settings: unknown }>(
      'select settings from public.user_settings where user_id = $1 limit 1',
      [userId],
    );
  } catch {
    throw new ManagedContentSafetyPolicyError();
  }

  if (!rows[0]) return false;
  const parsed = SafetyDocumentSchema.safeParse(rows[0].settings ?? {});
  if (!parsed.success) {
    throw new ManagedContentSafetyPolicyError('Managed content safety preference is invalid');
  }
  return parsed.data.safety?.reduceSensitiveContent === true;
}

export async function enforceManagedContentSafetyPreference(
  db: DatabaseAdapter,
  input: { userId: string; prompt: string },
): Promise<
  { enabled: boolean; allowed: true } | { enabled: true; allowed: false; refusal: string }
> {
  const enabled = await loadManagedContentSafetyPreference(db, input.userId);
  const decision = checkContentFilter(input.prompt, enabled, REDUCED_SENSITIVE_CONTENT_WEB_REFUSAL);
  return decision.allowed
    ? { enabled, allowed: true }
    : { enabled: true, allowed: false, refusal: decision.refusal };
}
