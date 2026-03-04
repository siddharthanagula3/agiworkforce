/**
 * Artifact Sharing Service
 *
 * Two-tier sharing strategy:
 *   1. Base64 — content < 4 KB or no active Supabase session.
 *      Encodes the artifact payload into a URL query parameter so no
 *      server-side storage is needed.
 *   2. Supabase — content >= 4 KB and user is logged in.
 *      Persists the artifact in the `shared_artifacts` table and
 *      returns a clean slug URL.  If the table does not yet exist the
 *      insert will fail; the service transparently falls back to the
 *      base64 strategy so the UI never errors out.
 */

import { getSupabase, getCurrentSession, getCurrentUser } from '../lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Public constant — change here to update all generated share URLs.
// ---------------------------------------------------------------------------
export const SHARE_BASE_URL = 'https://app.agiworkforce.com/shared';

// 4 KB threshold — content at or above this size goes to Supabase when
// the user is logged in.
const BASE64_SIZE_THRESHOLD_BYTES = 4 * 1024;

// UUID v4 pattern used to distinguish stored share IDs from base64 tokens.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface ShareResult {
  /** The full URL that can be shared with others. */
  url: string;
  /** Opaque identifier for the share — UUID for Supabase, hash for base64. */
  shareId: string;
  /** ISO 8601 timestamp at which the share expires, or undefined if permanent. */
  expiresAt?: string;
  /** Which storage strategy was used. */
  method: 'base64' | 'supabase';
}

export interface SharedArtifact {
  id: string;
  title: string;
  artifactType: string;
  content: string;
  language?: string;
  createdAt: string;
  expiresAt?: string;
  viewCount: number;
}

/** Payload that is stored inside the base64 URL parameter. */
interface Base64Payload {
  title: string;
  type: string;
  content: string;
  language?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Compute a short, URL-safe hash of a string.
 * Uses the djb2 algorithm — fast and good enough for a content fingerprint.
 */
function shortHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    // Bitwise operations intentionally used for hash computation (djb2).
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  // Encode as base36 (alphanumeric, no special chars) for URL safety.
  return hash.toString(36);
}

/**
 * Encode an artifact payload as a base64 string suitable for use in a URL
 * query parameter.  Uses `btoa` with UTF-8 support via `encodeURIComponent`.
 */
function encodeBase64Payload(payload: Base64Payload): string {
  const json = JSON.stringify(payload);
  // Convert to a base64 string that is safe inside a URL query parameter.
  return btoa(encodeURIComponent(json));
}

/**
 * Decode a base64-encoded payload that was previously created by
 * `encodeBase64Payload`.  Returns `null` if the data is malformed.
 */
function decodeBase64Payload(encoded: string): Base64Payload | null {
  try {
    const json = decodeURIComponent(atob(encoded));
    const parsed: unknown = JSON.parse(json);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>)['title'] !== 'string' ||
      typeof (parsed as Record<string, unknown>)['type'] !== 'string' ||
      typeof (parsed as Record<string, unknown>)['content'] !== 'string'
    ) {
      return null;
    }
    const obj = parsed as Record<string, unknown>;
    return {
      title: obj['title'] as string,
      type: obj['type'] as string,
      content: obj['content'] as string,
      language: typeof obj['language'] === 'string' ? obj['language'] : undefined,
    };
  } catch (err) {
    console.debug('[ArtifactSharing] Failed to decode base64 payload:', err);
    return null;
  }
}

/**
 * Build a ShareResult for the base64 strategy.
 */
function buildBase64ShareResult(
  artifact: Pick<Parameters<typeof shareArtifact>[0], 'title' | 'type' | 'content' | 'language'>,
): ShareResult {
  const payload: Base64Payload = {
    title: artifact.title,
    type: artifact.type,
    content: artifact.content,
    language: artifact.language,
  };
  const encoded = encodeBase64Payload(payload);
  const shareId = shortHash(artifact.content + artifact.title);
  const url = `${SHARE_BASE_URL}?data=${encoded}`;
  return { url, shareId, method: 'base64' };
}

/**
 * Attempt to persist an artifact in the `shared_artifacts` Supabase table.
 * Returns a ShareResult on success, or `null` if the operation fails for
 * any reason (table missing, network error, auth issue, etc.).
 */
async function trySupabaseShare(
  artifact: Parameters<typeof shareArtifact>[0],
  userId: string,
): Promise<ShareResult | null> {
  try {
    const client = getSupabase();

    // Calculate expiry timestamp if requested.
    let expiresAt: string | null = null;
    if (artifact.expiresInDays !== undefined && artifact.expiresInDays > 0) {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + artifact.expiresInDays);
      expiresAt = expiry.toISOString();
    }

    // The `shared_artifacts` table may not yet exist in the remote schema, so
    // we cast to untyped SupabaseClient and rely on the outer try/catch to
    // handle table-not-found errors gracefully.

    const { data, error } = await (client as unknown as SupabaseClient)
      .from('shared_artifacts')
      .insert({
        user_id: userId,
        title: artifact.title,
        artifact_type: artifact.type,
        content: artifact.content,
        language: artifact.language ?? null,
        metadata: null,
        expires_at: expiresAt,
      })
      .select('id, created_at, expires_at')
      .single();

    if (error) {
      console.warn(
        '[ArtifactSharing] Supabase insert failed, falling back to base64:',
        error.message,
      );
      return null;
    }

    const row = data as { id: string; created_at: string; expires_at: string | null };
    const url = `${SHARE_BASE_URL}/${row.id}`;
    return {
      url,
      shareId: row.id,
      expiresAt: row.expires_at ?? undefined,
      method: 'supabase',
    };
  } catch (err) {
    console.warn(
      '[ArtifactSharing] Unexpected error during Supabase share, falling back to base64:',
      err,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Share an artifact and return a shareable URL.
 *
 * Decision logic:
 *  - If the serialised content is < 4 KB OR the user has no active session,
 *    the artifact is encoded directly in the URL (base64 strategy).
 *  - Otherwise the artifact is stored in Supabase and a short UUID URL is
 *    returned.  If the Supabase write fails for any reason the function
 *    transparently falls back to base64.
 */
export async function shareArtifact(artifact: {
  id: string;
  title: string;
  type: string;
  content: string;
  language?: string;
  /** Number of days before the share expires.  Omit for a permanent share. */
  expiresInDays?: number;
}): Promise<ShareResult> {
  const contentBytes = new TextEncoder().encode(artifact.content).length;
  const isLarge = contentBytes >= BASE64_SIZE_THRESHOLD_BYTES;

  if (isLarge) {
    // Check whether the user is logged in before hitting Supabase.
    try {
      const session = await getCurrentSession();
      const user = await getCurrentUser();

      if (session && user) {
        const result = await trySupabaseShare(artifact, user.id);
        if (result) {
          return result;
        }
        // Fall through to base64 if Supabase failed.
      }
    } catch (err) {
      console.warn('[ArtifactSharing] Could not determine session, using base64 fallback:', err);
    }
  }

  return buildBase64ShareResult(artifact);
}

/**
 * Retrieve a shared artifact by its share ID.
 *
 * - If `shareId` is a UUID (hyphen-separated hex groups), it is looked up in
 *   Supabase and the view count is incremented.
 * - Otherwise the ID is treated as a base64-encoded content hash and the
 *   artifact data must be retrieved from the URL directly (this function
 *   returns `null` because the payload is embedded in the URL, not here).
 *
 * @param shareId - Either a UUID (Supabase) or a short hash (base64 strategy).
 * @returns The artifact, or `null` if not found / decoding fails.
 */
export async function getSharedArtifact(shareId: string): Promise<SharedArtifact | null> {
  const isUuid = UUID_REGEX.test(shareId);

  if (isUuid) {
    return getSharedArtifactFromSupabase(shareId);
  }

  // For base64 shares the payload lives in the URL query string, not on a
  // server.  Callers that construct the share URL from `?data=<encoded>`
  // should decode the payload themselves using `decodeBase64ShareData`.
  // Returning null here signals that there is no server-side record.
  return null;
}

/**
 * Decode a base64-encoded share data parameter extracted from a URL.
 *
 * Usage:
 *   const params = new URLSearchParams(window.location.search);
 *   const artifact = decodeBase64ShareData(params.get('data'));
 */
export function decodeBase64ShareData(encoded: string | null | undefined): SharedArtifact | null {
  if (!encoded) return null;

  const payload = decodeBase64Payload(encoded);
  if (!payload) return null;

  return {
    id: shortHash(payload.content + payload.title),
    title: payload.title,
    artifactType: payload.type,
    content: payload.content,
    language: payload.language,
    createdAt: new Date().toISOString(),
    expiresAt: undefined,
    viewCount: 0,
  };
}

/**
 * Fetch a Supabase-persisted shared artifact and increment its view counter.
 * Returns `null` if the row does not exist or an error occurs.
 */
async function getSharedArtifactFromSupabase(shareId: string): Promise<SharedArtifact | null> {
  try {
    const client = getSupabase();

    const { data, error } = await (client as unknown as SupabaseClient)
      .from('shared_artifacts')
      .select('id, title, artifact_type, content, language, created_at, expires_at, view_count')
      .eq('id', shareId)
      .single();

    if (error) {
      console.warn('[ArtifactSharing] Failed to fetch shared artifact:', error.message);
      return null;
    }

    if (!data) return null;

    const row = data as {
      id: string;
      title: string;
      artifact_type: string;
      content: string;
      language: string | null;
      created_at: string;
      expires_at: string | null;
      view_count: number;
    };

    // Check expiry before returning.
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      console.debug('[ArtifactSharing] Shared artifact has expired:', shareId);
      return null;
    }

    // Increment view count fire-and-forget — do not block the caller.
    void (client as unknown as SupabaseClient)
      .from('shared_artifacts')
      .update({ view_count: row.view_count + 1 })
      .eq('id', shareId)
      .then(({ error: updateErr }: { error: { message: string } | null }) => {
        if (updateErr) {
          console.debug('[ArtifactSharing] Failed to increment view count:', updateErr.message);
        }
      });

    return {
      id: row.id,
      title: row.title,
      artifactType: row.artifact_type,
      content: row.content,
      language: row.language ?? undefined,
      createdAt: row.created_at,
      expiresAt: row.expires_at ?? undefined,
      viewCount: row.view_count,
    };
  } catch (err) {
    console.warn('[ArtifactSharing] Unexpected error fetching shared artifact:', err);
    return null;
  }
}

/**
 * Revoke a previously created share.
 *
 * - For base64 shares (no server record) this is a no-op and returns `true`.
 * - For Supabase shares the row is deleted; only the owning user can delete it
 *   (enforced by Row Level Security on the `shared_artifacts` table).
 *
 * @returns `true` if the share was revoked (or was already a base64 share),
 *          `false` if the deletion failed.
 */
export async function revokeShare(shareId: string): Promise<boolean> {
  const isUuid = UUID_REGEX.test(shareId);

  if (!isUuid) {
    // Base64 shares have no server-side record — nothing to revoke.
    return true;
  }

  try {
    const client = getSupabase();

    // Verify the caller is logged in before attempting deletion.
    const user = await getCurrentUser();
    if (!user) {
      console.warn('[ArtifactSharing] Cannot revoke share: user is not authenticated.');
      return false;
    }

    // The WHERE clause on user_id means RLS will also enforce ownership even
    // if the server-side policy is not yet configured.

    const { error } = await (client as unknown as SupabaseClient)
      .from('shared_artifacts')
      .delete()
      .eq('id', shareId)
      .eq('user_id', user.id);

    if (error) {
      console.warn('[ArtifactSharing] Failed to revoke share:', error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.warn('[ArtifactSharing] Unexpected error revoking share:', err);
    return false;
  }
}
