/**
 * Desktop Auth Bridge Service
 *
 * Handles receiving Supabase sessions from the web app via encrypted deep link tokens.
 * The web app generates a short-lived (60s) AES-GCM encrypted token containing the
 * Supabase session, then opens `agiworkforce://auth?token=<encrypted_token>`.
 *
 * This service:
 * 1. Listens for 'agi-desktop-auth-token' events dispatched by useDeepLink.ts
 * 2. Decrypts the token using the same key derivation as the web API
 * 3. Validates the token (TTL, nonce)
 * 4. Stores the session in the desktop auth store
 * 5. Shows a success/error toast notification
 *
 * Security:
 * - Token TTL: 60 seconds (prevents replay after expiry)
 * - AES-256-GCM encryption with server-side secret
 * - One-time nonce tracking (prevents replay within TTL window)
 * - Tokens are never persisted to disk — only the extracted session is stored
 */

import { toast } from 'sonner';
import { useUnifiedAuthStore } from '../stores/auth';
import type { DesktopAuthTokenPayload, AuthSession } from '@agiworkforce/types';

// Track used nonces to prevent replay within the TTL window
const usedNonces = new Set<string>();

// Clean up expired nonces periodically (every 5 minutes)
const NONCE_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startNonceCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    // Just clear all nonces — they are only valid for 60s anyway
    usedNonces.clear();
  }, NONCE_CLEANUP_INTERVAL_MS);
}

function stopNonceCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

/**
 * Decrypt a desktop auth token.
 *
 * The token is AES-256-GCM encrypted using a key derived from SHA-256
 * of the TOTP_ENCRYPTION_KEY environment variable (or equivalent).
 *
 * Since this runs in the browser (Tauri webview), we use the Web Crypto API
 * for decryption. The key must be derived the same way as the server.
 *
 * Format: base64url(iv[12] + authTag[16] + ciphertext)
 */
async function decryptToken(
  encryptedToken: string,
  encryptionKey: string,
): Promise<DesktopAuthTokenPayload> {
  // Derive the same 32-byte key as the server (SHA-256 of the key source)
  const keySource = new TextEncoder().encode(encryptionKey);
  const keyHash = await crypto.subtle.digest('SHA-256', keySource);

  // Import the key for AES-GCM decryption
  const cryptoKey = await crypto.subtle.importKey('raw', keyHash, { name: 'AES-GCM' }, false, [
    'decrypt',
  ]);

  // Decode the base64url token
  const combined = base64urlDecode(encryptedToken);

  // Extract components: iv (12 bytes) + authTag (16 bytes) + ciphertext
  const iv = combined.slice(0, 12);
  const authTag = combined.slice(12, 28);
  const ciphertext = combined.slice(28);

  // AES-GCM in Web Crypto expects ciphertext + authTag concatenated
  const ciphertextWithTag = new Uint8Array(ciphertext.length + authTag.length);
  ciphertextWithTag.set(ciphertext);
  ciphertextWithTag.set(authTag, ciphertext.length);

  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    ciphertextWithTag,
  );

  const payload = JSON.parse(new TextDecoder().decode(decrypted)) as DesktopAuthTokenPayload;
  return payload;
}

function base64urlDecode(input: string): Uint8Array {
  // Convert base64url to standard base64
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  // Add padding if needed
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Validate the decrypted token payload.
 */
function validatePayload(payload: DesktopAuthTokenPayload): { valid: boolean; error?: string } {
  const now = Date.now();

  // Check TTL
  if (now > payload.expiresAt) {
    return {
      valid: false,
      error: 'Token has expired. Please try signing in again from the web app.',
    };
  }

  // Check issuedAt is in the past (with 5s tolerance for clock skew)
  if (payload.issuedAt > now + 5000) {
    return { valid: false, error: 'Token timestamp is in the future. Check system clock.' };
  }

  // Check nonce hasn't been used (replay prevention)
  if (usedNonces.has(payload.nonce)) {
    return { valid: false, error: 'Token has already been used. Please generate a new one.' };
  }

  // Validate session shape
  const session = payload.session;
  if (
    !session?.accessToken ||
    !session?.refreshToken ||
    !session?.user?.id ||
    !session?.user?.email
  ) {
    return { valid: false, error: 'Token contains an invalid session.' };
  }

  return { valid: true };
}

/**
 * Process a desktop auth token received via deep link.
 * Decrypts, validates, and stores the session.
 */
async function processDesktopAuthToken(encryptedToken: string): Promise<void> {
  try {
    // Get the encryption key — must match the server's TOTP_ENCRYPTION_KEY
    // The desktop app stores this in its settings or environment
    const encryptionKey = getDesktopTokenSecret();
    if (!encryptionKey) {
      toast.error('Desktop auth bridge not configured. Missing encryption key.');
      console.error(
        '[DesktopAuthBridge] No DESKTOP_TOKEN_SECRET or TOTP_ENCRYPTION_KEY configured',
      );
      return;
    }

    // Decrypt the token
    const payload = await decryptToken(encryptedToken, encryptionKey);

    // Validate the token
    const validation = validatePayload(payload);
    if (!validation.valid) {
      toast.error(validation.error || 'Invalid auth token');
      console.warn('[DesktopAuthBridge] Token validation failed:', validation.error);
      return;
    }

    // Mark nonce as used
    usedNonces.add(payload.nonce);
    startNonceCleanup();

    // Store the session in the auth store
    const session: AuthSession = payload.session;
    const store = useUnifiedAuthStore.getState();

    // Set user identity
    store.setUser({
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      avatar: session.user.avatar,
    });

    // Set tokens
    store.login({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    });

    // Trigger a sync to populate subscription/plan data
    void store.syncWithBackend();

    console.info('[DesktopAuthBridge] Session received from web app for user:', session.user.email);
    toast.success(`Signed in as ${session.user.email}`, {
      description: 'Session synced from AGI Workforce web app',
    });
  } catch (error) {
    console.error('[DesktopAuthBridge] Failed to process auth token:', error);
    toast.error('Failed to process sign-in from web app', {
      description: error instanceof Error ? error.message : 'Decryption or validation failed',
    });
  }
}

/**
 * Get the desktop token encryption secret.
 * Checks environment variables that match the web API's key derivation.
 */
function getDesktopTokenSecret(): string | null {
  // Check for desktop-specific env var first, then fall back to TOTP key
  return (
    (import.meta.env['VITE_DESKTOP_TOKEN_SECRET'] as string | undefined) ||
    (import.meta.env['VITE_TOTP_ENCRYPTION_KEY'] as string | undefined) ||
    null
  );
}

/**
 * Initialize the desktop auth bridge.
 * Call once during app startup to listen for deep link auth token events.
 * Returns a cleanup function.
 */
export function initDesktopAuthBridge(): () => void {
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<{ token: string }>;
    const token = customEvent.detail?.token;
    if (token) {
      void processDesktopAuthToken(token);
    }
  };

  window.addEventListener('agi-desktop-auth-token', handler);

  return () => {
    window.removeEventListener('agi-desktop-auth-token', handler);
    stopNonceCleanup();
  };
}
