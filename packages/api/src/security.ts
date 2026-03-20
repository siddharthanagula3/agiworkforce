/**
 * Security API — typed wrappers for auth_login, secret_manager_*, and master_password_* commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface AuthToken {
  token: string;
  expiresAt: string;
}

export interface MasterPasswordResponse {
  success: boolean;
  message: string;
}

export interface MasterPasswordStatus {
  configured: boolean;
  unlocked: boolean;
  needsMigration: boolean;
}

// ---- Auth Login ----

export async function authLogin(email: string, password: string): Promise<AuthToken> {
  return command<AuthToken>('auth_login', { email, password });
}

// ---- Secret Manager ----

export async function secretManagerHas(key: string): Promise<boolean> {
  return command<boolean>('secret_manager_has', { key });
}

export async function secretManagerSet(key: string, value: string): Promise<void> {
  return command<void>('secret_manager_set', { key, value });
}

export async function secretManagerDelete(key: string): Promise<void> {
  return command<void>('secret_manager_delete', { key });
}

// ---- Master Password ----

export async function masterPasswordIsConfigured(): Promise<boolean> {
  return command<boolean>('master_password_is_configured');
}

export async function masterPasswordIsUnlocked(): Promise<boolean> {
  return command<boolean>('master_password_is_unlocked');
}

export async function masterPasswordGetStatus(): Promise<MasterPasswordStatus> {
  return command<MasterPasswordStatus>('master_password_get_status');
}

export async function masterPasswordSetup(password: string): Promise<MasterPasswordResponse> {
  return command<MasterPasswordResponse>('master_password_setup', { password });
}

export async function masterPasswordVerify(password: string): Promise<boolean> {
  return command<boolean>('master_password_verify', { password });
}

export async function masterPasswordUnlock(password: string): Promise<MasterPasswordResponse> {
  return command<MasterPasswordResponse>('master_password_unlock', { password });
}

export async function masterPasswordLock(): Promise<MasterPasswordResponse> {
  return command<MasterPasswordResponse>('master_password_lock');
}

export async function masterPasswordChange(
  currentPassword: string,
  newPassword: string,
): Promise<MasterPasswordResponse> {
  return command<MasterPasswordResponse>('master_password_change', {
    currentPassword,
    newPassword,
  });
}

export async function masterPasswordNeedsMigration(): Promise<boolean> {
  return command<boolean>('master_password_needs_migration');
}

export async function masterPasswordStartMigration(): Promise<MasterPasswordResponse> {
  return command<MasterPasswordResponse>('master_password_start_migration');
}

export async function masterPasswordCompleteMigration(): Promise<MasterPasswordResponse> {
  return command<MasterPasswordResponse>('master_password_complete_migration');
}
