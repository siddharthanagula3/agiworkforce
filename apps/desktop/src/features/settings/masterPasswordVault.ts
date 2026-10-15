import { invoke } from '@/lib/tauri-mock';
import { notifyLocalModelCatalogChanged } from '@/lib/localModelCatalog';
import { reapplyLocalRuntimeProviders } from '@/stores/settingsStore';

/** The native side owns the numbers and sends them with the status. */
export interface PasswordPolicy {
  min_length: number;
  min_character_classes: number;
}

export type PasswordRuleViolation =
  | { rule: 'too_short'; min_length: number }
  | { rule: 'too_few_character_classes'; min_character_classes: number };

export interface MasterPasswordStatus {
  is_configured: boolean;
  is_unlocked: boolean;
  last_changed: string | null;
  needs_migration: boolean;
  password_policy: PasswordPolicy;
}

export interface MasterPasswordResponse {
  success: boolean;
  message: string;
  violation?: PasswordRuleViolation;
  /**
   * Providers whose saved key no key could open. While there are any, an
   * unlock keeps an older stored password as it is instead of upgrading it.
   */
  keys_not_upgraded?: string[];
}

const CHARACTER_CLASSES = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9\s]/u];

const CHARACTER_CLASS_NAMES = 'a lowercase letter, an uppercase letter, a number, a symbol';

/**
 * The first rule of the policy a new password breaks, checked before it is
 * sent. The native side checks again and has the last word.
 */
export function passwordRuleViolation(
  password: string,
  policy: PasswordPolicy,
): PasswordRuleViolation | null {
  if (Array.from(password).length < policy.min_length) {
    return { rule: 'too_short', min_length: policy.min_length };
  }
  const classes = CHARACTER_CLASSES.filter((kind) => kind.test(password)).length;
  if (classes < policy.min_character_classes) {
    return {
      rule: 'too_few_character_classes',
      min_character_classes: policy.min_character_classes,
    };
  }
  return null;
}

export function describePasswordRuleViolation(violation: PasswordRuleViolation): string {
  if (violation.rule === 'too_short') {
    return `Use at least ${violation.min_length} characters.`;
  }
  return `Use at least ${violation.min_character_classes} of these: ${CHARACTER_CLASS_NAMES}.`;
}

export function describePasswordPolicy(policy: PasswordPolicy): string {
  return `Use at least ${policy.min_length} characters, with at least ${policy.min_character_classes} of these: ${CHARACTER_CLASS_NAMES}.`;
}

/**
 * What to tell the user after an unlock that left saved keys behind, or null
 * when it left none.
 */
export function describeKeysNotUpgraded(response: MasterPasswordResponse): string | null {
  const providers = response.keys_not_upgraded ?? [];
  if (providers.length === 0) return null;
  return `Unlocked, but the saved keys for ${providers.join(', ')} could not be read, so your master password was left on its older, weaker protection and nothing was removed. Save each of those keys again or delete it in Settings, under Models & Keys, then lock and unlock.`;
}

/** What to show when the native side turned a request down. */
export function refusalMessage(response: MasterPasswordResponse): string {
  return response.violation ? describePasswordRuleViolation(response.violation) : response.message;
}

export const VAULT_STATE_CHANGED_EVENT = 'agi:vault-state-changed';

/**
 * The Local runtimes are registered from the renderer with whatever server
 * key the vault will release, so they are registered again whenever the vault
 * opens or closes. Everything that shows which keys are usable listens for
 * the event.
 */
async function applyVaultStateChange(): Promise<void> {
  try {
    await reapplyLocalRuntimeProviders();
  } catch (error) {
    console.error('Failed to re-register local runtimes after the vault changed:', error);
  }
  notifyLocalModelCatalogChanged('settings-refresh');
  window.dispatchEvent(new CustomEvent(VAULT_STATE_CHANGED_EVENT));
}

/**
 * Set the master password. The native side seals every saved provider key
 * under it in the same step, and leaves the vault open.
 */
export async function setUpMasterPassword(password: string): Promise<MasterPasswordResponse> {
  return invoke<MasterPasswordResponse>('master_password_setup', { password });
}

/**
 * Unlock the vault. The native side restores the providers whose keys it can
 * now read; the Local runtimes are registered from the renderer, so their
 * server keys are picked up here.
 */
export async function unlockMasterPassword(password: string): Promise<MasterPasswordResponse> {
  const result = await invoke<MasterPasswordResponse>('master_password_unlock', {
    password,
  });
  if (result.success) {
    await applyVaultStateChange();
  }
  return result;
}

/**
 * Change the master password. The native side re-seals every credential the
 * old password protected under the new one, or changes nothing. A change made
 * while locked leaves the vault open, so the same follow-up as an unlock runs.
 */
export async function changeMasterPassword(
  currentPassword: string,
  newPassword: string,
): Promise<MasterPasswordResponse> {
  const result = await invoke<MasterPasswordResponse>('master_password_change', {
    currentPassword,
    newPassword,
  });
  if (result.success) {
    await applyVaultStateChange();
  }
  return result;
}

/**
 * Remove the master password. The native side moves every key it protected
 * back under this device's key, so nothing is deleted and everything is
 * usable without unlocking.
 */
export async function removeMasterPassword(password: string): Promise<MasterPasswordResponse> {
  const result = await invoke<MasterPasswordResponse>('master_password_remove', {
    password,
  });
  if (result.success) {
    await applyVaultStateChange();
  }
  return result;
}

/**
 * Lock the vault. The native side forgets every provider key it read through
 * the vault, so those providers stop working until the next unlock.
 */
export async function lockMasterPassword(): Promise<void> {
  await invoke('master_password_lock');
  await applyVaultStateChange();
}
