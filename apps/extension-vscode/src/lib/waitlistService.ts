/**
 * waitlistService.ts — VS Code extension port of desktop/src/services/waitlistService.ts
 *
 * Uses raw Node https (no supabase-js) matching the extension's Node CJS target.
 * Supabase project URL and anon key are read from VS Code settings so they can be
 * configured without shipping a rebuild. Both default to empty strings — cloud
 * features are v1-deferred; the modal shows the invite-code UI but the redemption
 * path degrades gracefully when the project URL is unconfigured.
 */

import * as https from 'https';
import * as vscode from 'vscode';
import type { InviteCodeError } from '../features/cloud-bridge/types';

export interface WaitlistEntry {
  email: string;
  name?: string | undefined;
  referralSource?: string | undefined;
}

function getSupabaseUrl(): string {
  return vscode.workspace.getConfiguration('agiWorkforce').get<string>('supabaseUrl', '') ?? '';
}

function getSupabaseAnonKey(): string {
  return vscode.workspace.getConfiguration('agiWorkforce').get<string>('supabaseAnonKey', '') ?? '';
}

function httpsPost(url: string, headers: Record<string, string>, body: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options: https.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port !== '' ? parseInt(parsed.port, 10) : 443,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...headers,
      },
    };

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          resolve(null);
        }
      });
      res.on('error', reject);
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Stored anonymous session JWT (in-memory; survives the extension lifetime, not restarts).
let _anonJwt: string | null = null;
let _anonExpiry: number = 0;

async function ensureAnonSession(): Promise<string | null> {
  const supabaseUrl = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  if (!supabaseUrl || !anonKey) return null;

  const now = Math.floor(Date.now() / 1000);
  if (_anonJwt && _anonExpiry > now + 60) return _anonJwt;

  try {
    const data = (await httpsPost(
      `${supabaseUrl}/auth/v1/signup`,
      {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      JSON.stringify({ data: {} }),
    )) as { access_token?: string; expires_at?: number } | null;

    if (data?.access_token) {
      _anonJwt = data.access_token;
      _anonExpiry = data.expires_at ?? now + 3600;
      return _anonJwt;
    }
    return null;
  } catch (err) {
    console.error('[WaitlistService] anon sign-in failed:', err);
    return null;
  }
}

export async function redeemInviteCode(
  code: string,
  source: string = 'cloud_unlock',
): Promise<{ success: boolean; inviteId?: string; error?: InviteCodeError }> {
  const supabaseUrl = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  if (!supabaseUrl || !anonKey) {
    return { success: false, error: 'rpc_error' };
  }

  const jwt = await ensureAnonSession();
  if (!jwt) {
    return { success: false, error: 'anon_signin_failed' };
  }

  try {
    const data = (await httpsPost(
      `${supabaseUrl}/rest/v1/rpc/validate_and_redeem_invite_code`,
      {
        apikey: anonKey,
        Authorization: `Bearer ${jwt}`,
        Prefer: 'return=representation',
      },
      JSON.stringify({
        p_code: code.toUpperCase().trim(),
        p_surface: 'vscode',
        p_source: source,
      }),
    )) as Array<{ valid?: boolean; error?: string; invite_id?: string }> | null;

    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.valid) {
      const errCode = (result?.error ?? 'rpc_error') as InviteCodeError;
      return { success: false, error: errCode };
    }
    const inviteId = result.invite_id as string | undefined;
    if (inviteId === undefined) {
      return { success: false, error: 'rpc_error' };
    }
    return { success: true, inviteId };
  } catch (err) {
    console.error('[WaitlistService] redeem error:', err);
    return { success: false, error: 'rpc_error' };
  }
}

export async function joinWaitlist(
  entry: WaitlistEntry,
): Promise<{ success: boolean; error?: string }> {
  const supabaseUrl = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  if (!supabaseUrl || !anonKey) {
    return { success: false, error: 'Cloud service not configured.' };
  }

  try {
    const data = (await httpsPost(
      `${supabaseUrl}/rest/v1/waitlist`,
      {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Prefer: 'return=minimal',
      },
      JSON.stringify({
        email: entry.email.toLowerCase().trim(),
        name: entry.name ?? null,
        referral_source: entry.referralSource ?? null,
        status: 'pending',
      }),
    )) as { code?: string; message?: string } | null;

    if (data && 'code' in data) {
      if (data.code === '23505') {
        return { success: false, error: 'This email is already on the waitlist.' };
      }
      return { success: false, error: data.message ?? 'Failed to join waitlist.' };
    }
    return { success: true };
  } catch (err) {
    console.error('[WaitlistService] joinWaitlist error:', err);
    return { success: false, error: 'Failed to join waitlist. Please try again.' };
  }
}
