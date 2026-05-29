import type { InviteCodeError } from '../features/cloud-bridge/types';

export interface WaitlistEntry {
  email: string;
  name?: string | undefined;
  referralSource?: string | undefined;
}

const ACCOUNT_AUTH_NOT_WIRED =
  'AGI account web auth is not wired in the VS Code extension yet. Use AGI Workforce Web for invite and waitlist access.';

export async function redeemInviteCode(
  _code: string,
  _source: string = 'cloud_unlock',
): Promise<{ success: boolean; inviteId?: string; error?: InviteCodeError }> {
  return { success: false, error: 'account_auth_not_wired' };
}

export async function joinWaitlist(
  _entry: WaitlistEntry,
): Promise<{ success: boolean; error?: string }> {
  return { success: false, error: ACCOUNT_AUTH_NOT_WIRED };
}
