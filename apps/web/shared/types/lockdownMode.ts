import { z } from 'zod';

export const LOCKDOWN_PREFERENCE_NAMESPACE = 'lockdown';

export interface LockdownPreferences {
  enabled: boolean;
}

export const DEFAULT_LOCKDOWN_PREFERENCES: LockdownPreferences = { enabled: false };

const StoredLockdownSettingsSchema = z.object({
  [LOCKDOWN_PREFERENCE_NAMESPACE]: z.object({ enabled: z.boolean().optional() }).optional(),
});

/**
 * Whether the account has asked for every outbound tool path to be shut.
 *
 * Lockdown exists for the prompt-injection case: a page, document or connector
 * response that talks the model into calling something. Requiring approval is
 * the wrong control there, because the approval prompt describes the call in
 * the attacker's terms and the reader has no way to tell an injected request
 * from an intended one. Lockdown removes the tools instead, so there is
 * nothing to approve.
 *
 * Defaults to off, and any malformed stored value reads as off rather than on:
 * silently locking an account out of its connectors would be its own defect.
 */
export function parseLockdownEnabled(settings: unknown): boolean {
  const parsed = StoredLockdownSettingsSchema.safeParse(settings ?? {});
  if (!parsed.success) return DEFAULT_LOCKDOWN_PREFERENCES.enabled;
  return (
    parsed.data[LOCKDOWN_PREFERENCE_NAMESPACE]?.enabled ?? DEFAULT_LOCKDOWN_PREFERENCES.enabled
  );
}
