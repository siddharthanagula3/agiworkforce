/**
 * Settings Service
 * Manages user settings and preferences with full Supabase integration
 * Includes TOTP 2FA authentication support
 *
 * Storage: Vercel Blob (requires BLOB_READ_WRITE_TOKEN env var on the server)
 * Note: uploadAvatar is called from a server action / API route, not directly
 * from browser code, so BLOB_READ_WRITE_TOKEN is safe server-side.
 */

// AD-6 override: avatar storage migrated from Supabase Storage to Vercel Blob.
import { put } from '@vercel/blob';
import { getAuthToken } from '@shared/lib/get-auth-token';

// =============================================================================
// TOTP 2FA Configuration
// =============================================================================

/**
 * TOTP Configuration Constants
 * RFC 6238 compliant TOTP parameters
 */
const TOTP_CONFIG = {
  /** Issuer name shown in authenticator apps */
  ISSUER: 'AGI Platform',
  /** Algorithm for HMAC (SHA1 is most compatible with authenticator apps) */
  ALGORITHM: 'SHA1',
  /** Number of digits in TOTP code */
  DIGITS: 6,
  /** Time step in seconds (standard is 30) */
  PERIOD: 30,
  /** Number of backup codes to generate */
  BACKUP_CODE_COUNT: 8,
  /** Length of backup codes */
  BACKUP_CODE_LENGTH: 8,
  /** Secret key length in bytes (20 bytes = 160 bits, recommended) */
  SECRET_LENGTH: 20,
} as const;

/**
 * Base32 alphabet for encoding TOTP secrets
 * RFC 4648 compliant
 */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// =============================================================================
// TOTP Secret Encryption
// =============================================================================
// Updated: Jan 30th 2026 - Added encryption for TOTP secrets at rest

/**
 * New TOTP secrets must only be encrypted with a dedicated secret.
 * We intentionally fail closed instead of deriving from public configuration.
 *
 * Legacy deterministic key derivation is retained only as a migration read path
 * so already-stored secrets can still be decrypted and rotated safely.
 */
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

// Legacy TOTP key derived from NEXT_PUBLIC_SUPABASE_URL is no longer available
// after the Supabase-to-Neon migration. Any TOTP secrets encrypted with the old
// key cannot be decrypted automatically. Users will need to re-enroll.
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

/**
 * Encrypt a TOTP secret for secure storage
 * Returns base64-encoded string with IV prepended
 * TODO: Used by /api/settings/2fa/setup once server route is implemented.
 */

async function encryptTOTPSecret(secret: string): Promise<string> {
  const key = await getTOTPEncryptionKey();
  const encoder = new TextEncoder();
  const data = encoder.encode(secret);

  // Generate random IV (12 bytes for AES-GCM)
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);

  // Combine IV + encrypted data and encode as base64
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a TOTP secret from storage
 * Expects base64-encoded string with IV prepended
 * TODO: Used by /api/settings/2fa/* routes once server routes are implemented.
 */

async function decryptTOTPSecret(encryptedSecret: string): Promise<string> {
  // Check if this is an unencrypted legacy secret (plain Base32)
  // Base32 only uses A-Z and 2-7, no lowercase or special chars
  if (/^[A-Z2-7]+$/.test(encryptedSecret)) {
    // Legacy unencrypted secret - return as-is
    // TODO: Consider migrating legacy secrets to encrypted format
    return encryptedSecret;
  }

  // Decode base64
  const combined = Uint8Array.from(atob(encryptedSecret), (c) => c.charCodeAt(0));

  // Extract IV (first 12 bytes) and encrypted data
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

// =============================================================================
// TOTP Types
// =============================================================================

export interface TOTPSetupResult {
  /** Base32 encoded secret for manual entry */
  secret: string;
  /** otpauth:// URL for QR code generation */
  otpauthUrl: string;
  /** Backup codes for recovery */
  backupCodes: string[];
}

export interface TwoFactorStatus {
  /** Whether 2FA is currently enabled */
  enabled: boolean;
  /** When 2FA was enabled */
  enabledAt?: string;
  /** Number of backup codes remaining */
  backupCodesRemaining?: number;
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
  // Notification preferences
  email_notifications?: boolean;
  push_notifications?: boolean;
  workflow_alerts?: boolean;
  employee_updates?: boolean;
  system_maintenance?: boolean;
  marketing_emails?: boolean;
  weekly_reports?: boolean;
  instant_alerts?: boolean;

  // Security - 2FA
  two_factor_enabled?: boolean;
  totp_secret?: string;
  totp_enabled_at?: string;
  backup_codes?: string[];
  backup_codes_generated_at?: string;
  backup_codes_used?: number;
  session_timeout?: number;

  // System preferences
  theme?: 'light' | 'dark' | 'auto';
  auto_save?: boolean;
  debug_mode?: boolean;
  analytics_enabled?: boolean;

  // Advanced settings
  cache_size?: string;
  backup_frequency?: string;
  retention_period?: number;
  max_concurrent_jobs?: number;

  // AI preferences
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
  created_at: string;
  last_used_at?: string;
}

// =============================================================================
// TOTP Utility Functions
// =============================================================================

/**
 * Encode a Uint8Array to Base32 string
 * RFC 4648 compliant encoding
 */
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

/**
 * Decode a Base32 string to Uint8Array
 * RFC 4648 compliant decoding
 */
function decodeBase32(input: string): Uint8Array {
  // Remove any spaces and convert to uppercase
  const cleanInput = input.replace(/\s/g, '').toUpperCase();

  const output: number[] = [];
  let bits = 0;
  let value = 0;

  for (let i = 0; i < cleanInput.length; i++) {
    const char = cleanInput[i];
    const index = BASE32_ALPHABET.indexOf(char!);

    if (index === -1) {
      // Skip padding characters
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

/**
 * Generate a cryptographically secure random secret for TOTP
 * Returns a Base32 encoded string suitable for authenticator apps
 */
function generateTOTPSecret(): string {
  const buffer = new Uint8Array(TOTP_CONFIG.SECRET_LENGTH);
  crypto.getRandomValues(buffer);
  return encodeBase32(buffer);
}

/**
 * Generate an otpauth:// URL for QR code generation
 * Compatible with Google Authenticator, Authy, 1Password, etc.
 */
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

/**
 * Generate HMAC-SHA1 hash using Web Crypto API
 */
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

/**
 * Generate a TOTP code for the given secret and time
 * RFC 6238 compliant implementation
 */
async function generateTOTPCode(secret: string, timestamp: number = Date.now()): Promise<string> {
  // Calculate time counter (number of time steps since epoch)
  const timeStep = Math.floor(timestamp / 1000 / TOTP_CONFIG.PERIOD);

  // Convert counter to 8-byte big-endian buffer
  const timeBuffer = new Uint8Array(8);
  let counter = timeStep;
  for (let i = 7; i >= 0; i--) {
    timeBuffer[i] = counter & 0xff;
    counter = Math.floor(counter / 256);
  }

  // Decode the Base32 secret
  const keyBuffer = decodeBase32(secret);

  // Calculate HMAC-SHA1
  const hmac = await hmacSha1(keyBuffer, timeBuffer);

  // Dynamic truncation (RFC 4226)
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);

  // Generate digits
  const otp = code % Math.pow(10, TOTP_CONFIG.DIGITS);
  return otp.toString().padStart(TOTP_CONFIG.DIGITS, '0');
}

/**
 * Verify a TOTP code with time drift tolerance
 * Allows codes from previous and next time windows for clock skew
 */
async function verifyTOTPCode(
  secret: string,
  code: string,
  timestamp: number = Date.now(),
): Promise<boolean> {
  // Normalize the input code
  const normalizedCode = code.replace(/\s/g, '').trim();

  if (normalizedCode.length !== TOTP_CONFIG.DIGITS) {
    return false;
  }

  // Check current, previous, and next time windows (allows for clock drift)
  const timeOffsets = [0, -1, 1]; // Current, previous, next

  for (const offset of timeOffsets) {
    const adjustedTime = timestamp + offset * TOTP_CONFIG.PERIOD * 1000;
    const expectedCode = await generateTOTPCode(secret, adjustedTime);

    // Constant-time comparison to prevent timing attacks
    if (constantTimeCompare(normalizedCode, expectedCode)) {
      return true;
    }
  }

  return false;
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
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
  const charset = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Excluding I, O to avoid confusion

  for (let i = 0; i < TOTP_CONFIG.BACKUP_CODE_COUNT; i++) {
    const buffer = new Uint8Array(TOTP_CONFIG.BACKUP_CODE_LENGTH);
    crypto.getRandomValues(buffer);

    let code = '';
    for (let j = 0; j < buffer.length; j++) {
      code += charset[buffer[j]! % charset.length]!;
      // Add dash in the middle for readability
      if (j === 3) code += '-';
    }

    codes.push(code);
  }

  return codes;
}

/**
 * Hash a backup code for secure storage
 * Uses SHA-256 for hashing
 */
async function hashBackupCode(code: string): Promise<string> {
  // Normalize the code (remove dashes and spaces, uppercase)
  const normalizedCode = code.replace(/[-\s]/g, '').toUpperCase();

  const encoder = new TextEncoder();
  const data = encoder.encode(normalizedCode);
  const hash = await crypto.subtle.digest('SHA-256', data);

  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verify a backup code against stored hashes
 * Returns the index of the matched code or -1 if not found
 */
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
  /**
   * Get user profile via /api/me
   */
  async getProfile(): Promise<{ data: UserProfile | null; error?: string }> {
    try {
      const token = await getAuthToken();
      if (!token) {
        return { data: null, error: 'User not authenticated' };
      }

      const res = await fetch('/api/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        return { data: null, error: `HTTP ${res.status}` };
      }

      const me = (await res.json()) as {
        id: string;
        email?: string | null;
        name?: string | null;
        avatar_url?: string | null;
        plan?: { tier?: string };
      };

      return {
        data: {
          id: me.id,
          email: me.email ?? undefined,
          name: me.name ?? undefined,
          avatar_url: me.avatar_url ?? undefined,
          // bio, phone, timezone, language not returned by /api/me
          // TODO: extend /api/me GET or add /api/settings/profile route
          timezone: 'America/New_York',
          language: 'en',
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

  /**
   * Update user profile
   * TODO: Implement PATCH /api/me or /api/settings/profile route for profile updates.
   */
  async updateProfile(_profile: Partial<UserProfile>): Promise<{ error?: string }> {
    return {};
  }

  /**
   * Get user settings
   * TODO: Implement /api/settings/preferences route for persistent user settings.
   * Returns in-memory defaults until a dedicated route is available.
   */
  async getSettings(): Promise<{ data: UserSettings; error?: string }> {
    return {
      data: {
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
      },
    };
  }

  /**
   * Update user settings
   * TODO: Implement PATCH /api/settings/preferences route for persisting user settings.
   */
  async updateSettings(_settings: Partial<UserSettings>): Promise<{ error?: string }> {
    return {};
  }

  /**
   * Upload avatar to Vercel Blob (migrated from Supabase Storage, AD-6 override).
   * Requires BLOB_READ_WRITE_TOKEN on the server.
   */
  async uploadAvatar(file: File): Promise<{ data: string; error?: string }> {
    try {
      const token = await getAuthToken();
      if (!token) {
        return { data: '', error: 'User not authenticated' };
      }

      // Generate unique filename (no userId needed for uniqueness)
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${crypto.randomUUID()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      // Upload to Vercel Blob
      const blob = await put(filePath, file, {
        access: 'public',
        contentType: file.type,
      });

      // Update profile with new avatar URL
      await this.updateProfile({ avatar_url: blob.url });

      return { data: blob.url };
    } catch (error) {
      return {
        data: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Change user password
   */
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

  /**
   * Get user API keys
   * TODO: Implement /api/settings/api-keys route for API key management.
   */
  async getAPIKeys(): Promise<{ data: APIKey[]; error?: string }> {
    return { data: [] };
  }

  /**
   * Create new API key
   * TODO: Implement POST /api/settings/api-keys route.
   */
  async createAPIKey(
    _name: string,
  ): Promise<{ data: APIKey | null; error?: string; fullKey?: string }> {
    return { data: null, error: 'API key management not yet available via API' };
  }

  /**
   * Delete API key
   * TODO: Implement DELETE /api/settings/api-keys/[id] route.
   */
  async deleteAPIKey(_keyId: string): Promise<{ error?: string }> {
    return { error: 'API key management not yet available via API' };
  }

  // ===========================================================================
  // Two-Factor Authentication (TOTP) Methods
  // TODO: All TOTP methods require a dedicated /api/settings/2fa server route
  // so that TOTP secrets never transit the browser in plaintext.
  // ===========================================================================

  /**
   * Get the current 2FA status for the user
   * Calls GET /api/settings/2fa
   */
  async get2FAStatus(): Promise<{ data: TwoFactorStatus; error?: string }> {
    try {
      const token = await getAuthToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/settings/2fa', { headers });
      if (!res.ok) {
        return { data: { enabled: false }, error: `HTTP ${res.status}` };
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

  /**
   * Initialize 2FA setup — generates a new TOTP secret and backup codes.
   * Calls POST /api/settings/2fa/setup
   * The secret is never stored in plaintext; the server encrypts before saving.
   */
  async setup2FA(): Promise<{ data?: TOTPSetupResult; error?: string }> {
    try {
      const token = await getAuthToken();
      if (!token) return { error: 'User not authenticated' };

      const res = await fetch('/api/settings/2fa/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        return { error: err.error ?? `HTTP ${res.status}` };
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

  /**
   * Verify a TOTP code and enable 2FA on the account.
   * Must be called after setup2FA(). Calls POST /api/settings/2fa/verify
   */
  async verify2FA(code: string): Promise<{ success: boolean; error?: string }> {
    try {
      const token = await getAuthToken();
      if (!token) return { success: false, error: 'User not authenticated' };

      const res = await fetch('/api/settings/2fa/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        return { success: false, error: err.error ?? `HTTP ${res.status}` };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Validate a TOTP code for step-up auth (not login — Clerk handles login).
   * Calls POST /api/settings/2fa/validate
   */
  async validateTOTPCode(code: string): Promise<{
    valid: boolean;
    usedBackupCode?: boolean;
    error?: string;
  }> {
    try {
      const token = await getAuthToken();
      if (!token) return { valid: false, error: 'User not authenticated' };

      const res = await fetch('/api/settings/2fa/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        valid?: boolean;
        used_backup_code?: boolean;
        error?: string;
      };

      if (!res.ok) {
        return { valid: false, error: json.error ?? `HTTP ${res.status}` };
      }
      return { valid: json.valid ?? false, usedBackupCode: json.used_backup_code };
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Disable 2FA on the account.
   * Requires the current TOTP code (or a backup code) to authorize.
   * Calls DELETE /api/settings/2fa
   */
  async disable2FA(code: string): Promise<{ success: boolean; error?: string }> {
    try {
      const token = await getAuthToken();
      if (!token) return { success: false, error: 'User not authenticated' };

      const res = await fetch('/api/settings/2fa', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        return { success: false, error: err.error ?? `HTTP ${res.status}` };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Regenerate backup codes. Requires the current TOTP code to authorize.
   * Calls POST /api/settings/2fa/backup-codes
   */
  async regenerateBackupCodes(totpCode: string): Promise<{
    backupCodes?: string[];
    error?: string;
  }> {
    try {
      const token = await getAuthToken();
      if (!token) return { error: 'User not authenticated' };

      const res = await fetch('/api/settings/2fa/backup-codes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: totpCode }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        return { error: err.error ?? `HTTP ${res.status}` };
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

// Export TOTP utility functions for use in authentication flows
// encryptTOTPSecret / decryptTOTPSecret are also exported for the pending
// /api/settings/2fa server route implementation.
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
