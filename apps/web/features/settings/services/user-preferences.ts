
import {
  MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH,
  managedCloudPreferencesNamespacePath,
} from '@agiworkforce/cloud-contracts';

import { getAuthToken } from '@shared/lib/get-auth-token';
import { getCsrfToken } from '@/lib/client/csrf';
import type { ApiKeyScope } from '@/lib/api-key-scopes';

const TOTP_CONFIG = {
  ISSUER: 'AGI Platform',
  ALGORITHM: 'SHA1',
  DIGITS: 6,
  PERIOD: 30,
  BACKUP_CODE_COUNT: 8,
  BACKUP_CODE_LENGTH: 8,
  SECRET_LENGTH: 20,
} as const;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const TOTP_ENCRYPTION_UNAVAILABLE_MESSAGE =
  'TOTP secret encryption is not configured. Set TOTP_ENCRYPTION_KEY before enabling 2FA setup.';

function getConfiguredTOTPKeyMaterial(): Uint8Array | null {
  const envKey = typeof process !== 'undefined' ? process.env['TOTP_ENCRYPTION_KEY'] : undefined;

  if (!envKey || envKey.length < 32) {
    return null;
  }

  return new TextEncoder().encode(envKey.slice(0, 32));
}

async function importTOTPEncryptionKey(keyMaterial: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    keyMaterial as unknown as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function getLegacyTOTPEncryptionKey(): Promise<CryptoKey | null> {
  return null;
}

async function getTOTPEncryptionKey(): Promise<CryptoKey> {
  const keyMaterial = getConfiguredTOTPKeyMaterial();
  if (!keyMaterial) {
    throw new Error(TOTP_ENCRYPTION_UNAVAILABLE_MESSAGE);
  }

  return importTOTPEncryptionKey(keyMaterial);
}

async function encryptTOTPSecret(secret: string): Promise<string> {
  const key = await getTOTPEncryptionKey();
  const encoder = new TextEncoder();
  const data = encoder.encode(secret);

  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

async function decryptTOTPSecret(encryptedSecret: string): Promise<string> {
  if (/^[A-Z2-7]+$/.test(encryptedSecret)) {
    // TODO: Consider migrating legacy secrets to encrypted format
    return encryptedSecret;
  }

  const combined = Uint8Array.from(atob(encryptedSecret), (c) => c.charCodeAt(0));

  const iv = combined.slice(0, 12);
  const encryptedData = combined.slice(12);

  const configuredKey = getConfiguredTOTPKeyMaterial();
  const candidateKeys: CryptoKey[] = [];

  if (configuredKey) {
    candidateKeys.push(await importTOTPEncryptionKey(configuredKey));
  }

  const legacyKey = await getLegacyTOTPEncryptionKey();
  if (legacyKey) {
    candidateKeys.push(legacyKey);
  }

  if (candidateKeys.length === 0) {
    throw new Error(TOTP_ENCRYPTION_UNAVAILABLE_MESSAGE);
  }

  for (const key of candidateKeys) {
    try {
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encryptedData);
      return new TextDecoder().decode(decrypted);
    } catch {
      // Try the next candidate key so legacy secrets remain recoverable.
    }
  }

  throw new Error('Unable to decrypt stored TOTP secret with the configured key material.');
}

export interface TOTPSetupResult {
  secret: string;
  otpauthUrl: string;
  backupCodes: string[];
}

export interface TwoFactorStatus {
  enabled: boolean;
  enabledAt?: string;
  backupCodesRemaining?: number;
}

async function readTwoFactorError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as {
    error?: string | { message?: string };
  } | null;
  const raw = body?.error;
  if (typeof raw === 'string' && raw.trim()) return raw;
  if (raw && typeof raw === 'object' && typeof raw.message === 'string' && raw.message.trim()) {
    return raw.message;
  }
  return `HTTP ${res.status}`;
}

export interface UserProfile {
  id: string;
  email?: string;
  name?: string;
  avatar_url?: string;
  phone?: string;
  bio?: string;
  timezone?: string;
  language?: string;
  role?: string;
  plan?: string;
}

export interface UserSettings {
  email_notifications?: boolean;
  push_notifications?: boolean;
  workflow_alerts?: boolean;
  employee_updates?: boolean;
  system_maintenance?: boolean;
  marketing_emails?: boolean;
  weekly_reports?: boolean;
  instant_alerts?: boolean;

  two_factor_enabled?: boolean;
  totp_secret?: string;
  totp_enabled_at?: string;
  backup_codes?: string[];
  backup_codes_generated_at?: string;
  backup_codes_used?: number;
  session_timeout?: number;

  theme?: 'light' | 'dark' | 'auto';
  auto_save?: boolean;
  debug_mode?: boolean;
  analytics_enabled?: boolean;

  cache_size?: string;
  backup_frequency?: string;
  retention_period?: number;
  max_concurrent_jobs?: number;

  default_ai_provider?:
    | 'openai'
    | 'anthropic'
    | 'google'
    | 'perplexity'
    | 'grok'
    | 'deepseek'
    | 'qwen'
    | 'moonshot'
    | 'zhipu';
  default_ai_model?: string;
  prefer_streaming?: boolean;
  ai_temperature?: number;
  ai_max_tokens?: number;
}

export interface APIKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: ApiKeyScope[];
  created_at: string;
  last_used_at?: string;
}

function encodeBase32(buffer: Uint8Array): string {
  let result = '';
  let bits = 0;
  let value = 0;

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i]!;
    bits += 8;

    while (bits >= 5) {
      result += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    result += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return result;
}

function decodeBase32(input: string): Uint8Array {
  const cleanInput = input.replace(/\s/g, '').toUpperCase();

  const output: number[] = [];
  let bits = 0;
  let value = 0;

  for (let i = 0; i < cleanInput.length; i++) {
    const char = cleanInput[i];
    const index = BASE32_ALPHABET.indexOf(char!);

    if (index === -1) {
      if (char === '=') continue;
      throw new Error(`Invalid Base32 character: ${char}`);
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return new Uint8Array(output);
}

function generateTOTPSecret(): string {
  const buffer = new Uint8Array(TOTP_CONFIG.SECRET_LENGTH);
  crypto.getRandomValues(buffer);
  return encodeBase32(buffer);
}

function generateOTPAuthURL(
  secret: string,
  accountName: string,
  issuer: string = TOTP_CONFIG.ISSUER,
): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedAccount = encodeURIComponent(accountName);

  return (
    `otpauth://totp/${encodedIssuer}:${encodedAccount}` +
    `?secret=${secret}` +
    `&issuer=${encodedIssuer}` +
    `&algorithm=${TOTP_CONFIG.ALGORITHM}` +
    `&digits=${TOTP_CONFIG.DIGITS}` +
    `&period=${TOTP_CONFIG.PERIOD}`
  );
}

async function hmacSha1(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as unknown as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, message as unknown as ArrayBuffer);
  return new Uint8Array(signature);
}

async function generateTOTPCode(secret: string, timestamp: number = Date.now()): Promise<string> {
  const timeStep = Math.floor(timestamp / 1000 / TOTP_CONFIG.PERIOD);

  const timeBuffer = new Uint8Array(8);
  let counter = timeStep;
  for (let i = 7; i >= 0; i--) {
    timeBuffer[i] = counter & 0xff;
    counter = Math.floor(counter / 256);
  }

  const keyBuffer = decodeBase32(secret);

  const hmac = await hmacSha1(keyBuffer, timeBuffer);

  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);

  const otp = code % Math.pow(10, TOTP_CONFIG.DIGITS);
  return otp.toString().padStart(TOTP_CONFIG.DIGITS, '0');
}

async function verifyTOTPCode(
  secret: string,
  code: string,
  timestamp: number = Date.now(),
): Promise<boolean> {
  const normalizedCode = code.replace(/\s/g, '').trim();

  if (normalizedCode.length !== TOTP_CONFIG.DIGITS) {
    return false;
  }

  const timeOffsets = [0, -1, 1];

  for (const offset of timeOffsets) {
    const adjustedTime = timestamp + offset * TOTP_CONFIG.PERIOD * 1000;
    const expectedCode = await generateTOTPCode(secret, adjustedTime);

    if (constantTimeCompare(normalizedCode, expectedCode)) {
      return true;
    }
  }

  return false;
}

function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Generate secure random backup codes
 * Returns array of human-readable codes in format XXXX-XXXX
 */
function generateBackupCodes(): string[] {
  const codes: string[] = [];
  const charset = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';

  for (let i = 0; i < TOTP_CONFIG.BACKUP_CODE_COUNT; i++) {
    const buffer = new Uint8Array(TOTP_CONFIG.BACKUP_CODE_LENGTH);
    crypto.getRandomValues(buffer);

    let code = '';
    for (let j = 0; j < buffer.length; j++) {
      code += charset[buffer[j]! % charset.length]!;
      if (j === 3) code += '-';
    }

    codes.push(code);
  }

  return codes;
}

async function hashBackupCode(code: string): Promise<string> {
  const normalizedCode = code.replace(/[-\s]/g, '').toUpperCase();

  const encoder = new TextEncoder();
  const data = encoder.encode(normalizedCode);
  const hash = await crypto.subtle.digest('SHA-256', data);

  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyBackupCode(code: string, hashedCodes: string[]): Promise<number> {
  const inputHash = await hashBackupCode(code);

  for (let i = 0; i < hashedCodes.length; i++) {
    if (constantTimeCompare(inputHash, hashedCodes[i]!)) {
      return i;
    }
  }

  return -1;
}

class SettingsService {
  async getProfile(): Promise<{ data: UserProfile | null; error?: string }> {
    try {
      const token = await getAuthToken();
      if (!token) {
        return { data: null, error: 'User not authenticated' };
      }

      const [meRes, prefRes] = await Promise.all([
        fetch('/api/me', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(managedCloudPreferencesNamespacePath('profile'), {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!meRes.ok) {
        return { data: null, error: `HTTP ${meRes.status}` };
      }

      const me = (await meRes.json()) as {
        id: string;
        email?: string | null;
        name?: string | null;
        avatar_url?: string | null;
        plan?: { tier?: string };
      };

      type StoredProfile = {
        bio?: string;
        phone?: string;
        timezone?: string;
        language?: string;
      };
      let stored: StoredProfile = {};
      if (prefRes.ok) {
        const prefJson = (await prefRes.json()) as { settings?: StoredProfile };
        if (prefJson.settings && typeof prefJson.settings === 'object') {
          stored = prefJson.settings;
        }
      }

      return {
        data: {
          id: me.id,
          email: me.email ?? undefined,
          name: me.name ?? undefined,
          avatar_url: me.avatar_url ?? undefined,
          timezone: stored.timezone ?? 'America/New_York',
          language: stored.language ?? 'en',
          bio: stored.bio,
          phone: stored.phone,
          plan: me.plan?.tier,
        },
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async updateProfile(profile: Partial<UserProfile>): Promise<{ error?: string }> {
    try {
      const token = await getAuthToken();
      if (!token) {
        return { error: 'User not authenticated' };
      }

      const csrfToken = await getCsrfToken();

      const corePayload: Record<string, unknown> = {};
      if (profile.name !== undefined) corePayload['display_name'] = profile.name;
      if (profile.avatar_url !== undefined) corePayload['avatar_url'] = profile.avatar_url;

      if (Object.keys(corePayload).length > 0) {
        const res = await fetch('/api/me', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'x-csrf-token': csrfToken,
          },
          body: JSON.stringify(corePayload),
        });

        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          return { error: err.error ?? `HTTP ${res.status}` };
        }
      }

      const extPayload: Record<string, unknown> = {};
      if (profile.bio !== undefined) extPayload['bio'] = profile.bio;
      if (profile.phone !== undefined) extPayload['phone'] = profile.phone;
      if (profile.timezone !== undefined) extPayload['timezone'] = profile.timezone;
      if (profile.language !== undefined) extPayload['language'] = profile.language;

      if (Object.keys(extPayload).length > 0) {
        const prefRes = await fetch(MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'x-csrf-token': csrfToken,
          },
          body: JSON.stringify({ namespace: 'profile', value: extPayload }),
        });

        if (!prefRes.ok) {
          const err = (await prefRes.json().catch(() => ({}))) as { error?: string };
          return { error: err.error ?? `HTTP ${prefRes.status}` };
        }
      }

      return {};
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getSettings(): Promise<{ data: UserSettings; error?: string }> {
    const hardcodedDefaults: UserSettings = {
      email_notifications: true,
      push_notifications: true,
      workflow_alerts: true,
      employee_updates: true,
      system_maintenance: true,
      marketing_emails: false,
      weekly_reports: true,
      instant_alerts: true,
      two_factor_enabled: false,
      session_timeout: 60,
      theme: 'dark',
      auto_save: true,
      debug_mode: false,
      analytics_enabled: true,
      cache_size: '1GB',
      backup_frequency: 'daily',
      retention_period: 30,
      max_concurrent_jobs: 10,
      default_ai_provider: 'openai',
      prefer_streaming: true,
      ai_temperature: 0.7,
      ai_max_tokens: 4000,
    };

    try {
      const token = await getAuthToken();
      if (!token) {
        return { data: hardcodedDefaults, error: 'User not authenticated' };
      }

      const res = await fetch(MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        return { data: hardcodedDefaults, error: `HTTP ${res.status}` };
      }

      const json = (await res.json()) as { settings?: Record<string, unknown> };
      const stored = json.settings ?? {};

      return {
        data: { ...hardcodedDefaults, ...(stored as Partial<UserSettings>) },
      };
    } catch (error) {
      return {
        data: hardcodedDefaults,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async updateSettings(settings: Partial<UserSettings>): Promise<{ error?: string }> {
    try {
      const token = await getAuthToken();
      if (!token) {
        return { error: 'User not authenticated' };
      }

      const csrfToken = await getCsrfToken();

      const res = await fetch(MANAGED_CLOUD_SETTINGS_PREFERENCES_PATH, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ settings }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        return { error: err.error ?? `HTTP ${res.status}` };
      }

      return {};
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async uploadAvatar(file: File): Promise<{ data: string; error?: string }> {
    try {
      const token = await getAuthToken();
      if (!token) {
        return { data: '', error: 'User not authenticated' };
      }

      const csrfToken = await getCsrfToken();
      const presignRes = await fetch('/api/uploads/presign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          kind: 'avatar',
          fileName: file.name,
          mimeType: file.type,
          byteCount: file.size,
        }),
      });

      if (!presignRes.ok) {
        const err = (await presignRes.json().catch(() => ({}))) as { message?: string };
        return { data: '', error: err.message ?? `HTTP ${presignRes.status}` };
      }

      const presign = (await presignRes.json()) as {
        uploadUrl: string;
        uploadHeaders?: Record<string, string>;
        publicUrl: string;
      };

      const putRes = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: presign.uploadHeaders ?? { 'Content-Type': file.type },
        body: file,
      });

      if (!putRes.ok) {
        return { data: '', error: `Upload failed (HTTP ${putRes.status})` };
      }

      await this.updateProfile({ avatar_url: presign.publicUrl });

      return { data: presign.publicUrl };
    } catch (error) {
      return {
        data: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async changePassword(newPassword: string): Promise<{ error?: string }> {
    try {
      const clerkUser = (
        window as unknown as Record<string, unknown> & {
          Clerk?: { user?: { updatePassword?: (opts: { newPassword: string }) => Promise<void> } };
        }
      )?.Clerk?.user;
      if (!clerkUser?.updatePassword) {
        return { error: 'Password update is not available' };
      }
      await clerkUser.updatePassword({ newPassword });
      return {};
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getAPIKeys(signal?: AbortSignal): Promise<{ data: APIKey[]; error?: string }> {
    try {
      const token = await getAuthToken();
      if (!token) {
        return { data: [], error: 'User not authenticated' };
      }

      signal?.throwIfAborted();

      const res = await fetch('/api/settings/api-keys', {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });

      if (!res.ok) {
        return { data: [], error: `HTTP ${res.status}` };
      }

      const json = (await res.json()) as { api_keys: APIKey[] };
      return { data: json.api_keys ?? [] };
    } catch (error) {
      return {
        data: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async createAPIKey(
    name: string,
    scopes: ApiKeyScope[],
  ): Promise<{ data: APIKey | null; error?: string; fullKey?: string }> {
    try {
      const token = await getAuthToken();
      if (!token) {
        return { data: null, error: 'User not authenticated' };
      }

      const csrfToken = await getCsrfToken();

      const res = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ name, scopes }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        return { data: null, error: err.error ?? `HTTP ${res.status}` };
      }

      const json = (await res.json()) as { api_key: APIKey; full_key: string };
      return { data: json.api_key, fullKey: json.full_key };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async deleteAPIKey(keyId: string): Promise<{ error?: string }> {
    try {
      const token = await getAuthToken();
      if (!token) {
        return { error: 'User not authenticated' };
      }

      const csrfToken = await getCsrfToken();

      const res = await fetch(`/api/settings/api-keys/${encodeURIComponent(keyId)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-csrf-token': csrfToken,
        },
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        return { error: err.error ?? `HTTP ${res.status}` };
      }

      return {};
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async get2FAStatus(): Promise<{ data: TwoFactorStatus; error?: string }> {
    try {
      const token = await getAuthToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/settings/2fa', { headers });
      if (!res.ok) {
        return { data: { enabled: false }, error: await readTwoFactorError(res) };
      }
      const json = (await res.json()) as {
        enabled: boolean;
        enabled_at?: string;
        backup_codes_remaining?: number;
      };
      return {
        data: {
          enabled: json.enabled,
          enabledAt: json.enabled_at,
          backupCodesRemaining: json.backup_codes_remaining,
        },
      };
    } catch (error) {
      return {
        data: { enabled: false },
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async setup2FA(): Promise<{ data?: TOTPSetupResult; error?: string; status?: number }> {
    try {
      const token = await getAuthToken();
      if (!token) return { error: 'User not authenticated' };

      const res = await fetch('/api/settings/2fa/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-csrf-token': await getCsrfToken(),
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        return { error: await readTwoFactorError(res), status: res.status };
      }

      const json = (await res.json()) as {
        secret: string;
        otpauth_url: string;
        backup_codes: string[];
      };
      return {
        data: {
          secret: json.secret,
          otpauthUrl: json.otpauth_url,
          backupCodes: json.backup_codes,
        },
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async verify2FA(code: string): Promise<{ success: boolean; error?: string; status?: number }> {
    try {
      const token = await getAuthToken();
      if (!token) return { success: false, error: 'User not authenticated' };

      const res = await fetch('/api/settings/2fa/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-csrf-token': await getCsrfToken(),
        },
        body: JSON.stringify({ code }),
      });

      if (!res.ok) {
        return { success: false, error: await readTwoFactorError(res), status: res.status };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async validateTOTPCode(code: string): Promise<{
    valid: boolean;
    usedBackupCode?: boolean;
    error?: string;
    status?: number;
  }> {
    try {
      const token = await getAuthToken();
      if (!token) return { valid: false, error: 'User not authenticated' };

      const res = await fetch('/api/settings/2fa/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-csrf-token': await getCsrfToken(),
        },
        body: JSON.stringify({ code }),
      });

      if (!res.ok) {
        return { valid: false, error: await readTwoFactorError(res), status: res.status };
      }

      const json = (await res.json().catch(() => ({}))) as {
        valid?: boolean;
        used_backup_code?: boolean;
      };
      return { valid: json.valid ?? false, usedBackupCode: json.used_backup_code };
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async disable2FA(code: string): Promise<{ success: boolean; error?: string; status?: number }> {
    try {
      const token = await getAuthToken();
      if (!token) return { success: false, error: 'User not authenticated' };

      const res = await fetch('/api/settings/2fa', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-csrf-token': await getCsrfToken(),
        },
        body: JSON.stringify({ code }),
      });

      if (!res.ok) {
        return { success: false, error: await readTwoFactorError(res), status: res.status };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async regenerateBackupCodes(totpCode: string): Promise<{
    backupCodes?: string[];
    error?: string;
    status?: number;
  }> {
    try {
      const token = await getAuthToken();
      if (!token) return { error: 'User not authenticated' };

      const res = await fetch('/api/settings/2fa/backup-codes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-csrf-token': await getCsrfToken(),
        },
        body: JSON.stringify({ code: totpCode }),
      });

      if (!res.ok) {
        return { error: await readTwoFactorError(res), status: res.status };
      }
      const json = (await res.json()) as { backup_codes: string[] };
      return { backupCodes: json.backup_codes };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * @deprecated Use setup2FA() and verify2FA() instead
   * Legacy method for backwards compatibility - now initiates full 2FA setup
   */
  async enable2FA(): Promise<{
    error?: string;
    secret?: string;
    otpauthUrl?: string;
    backupCodes?: string[];
  }> {
    const result = await this.setup2FA();
    if (result.error) {
      return { error: result.error };
    }
    return {
      secret: result.data?.secret,
      otpauthUrl: result.data?.otpauthUrl,
      backupCodes: result.data?.backupCodes,
    };
  }
}

const settingsService = new SettingsService();
export default settingsService;
export { settingsService };

// encryptTOTPSecret / decryptTOTPSecret are also exported for the pending
export {
  generateTOTPSecret,
  generateOTPAuthURL,
  generateTOTPCode,
  verifyTOTPCode,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
  encryptTOTPSecret,
  decryptTOTPSecret,
  TOTP_CONFIG,
};
