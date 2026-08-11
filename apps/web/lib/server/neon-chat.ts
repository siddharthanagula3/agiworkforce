import 'server-only';

import type { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createError } from '@/lib/errors';
import { getNeonDb } from '@/lib/server/neon-db';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  INTERACTIVE_CARDS_MAX_PER_MESSAGE,
  INTERACTIVE_CARDS_METADATA_KEY,
} from '@agiworkforce/types';
import {
  MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH,
  managedCloudMetadataLength,
  readPersistedInteractiveCards,
} from '@agiworkforce/cloud-contracts';

export type ChatConversationRow = {
  id: string;
  title: string;
  model: string | null;
  project_id: string | null;
  pinned: boolean;
  starred: boolean;
  archived: boolean;
  is_temporary: boolean;
  created_at: string;
  updated_at: string;
  /**
   * Set when the conversation is soft-deleted. Present so the recently-deleted
   * list can show WHEN something was deleted; null on every normal read, which
   * filters `deleted_at is null`.
   */
  deleted_at?: string | null;
};

export type ChatMessageRow = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model: string | null;
  provider: string | null;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

export function getNeonChatDb(): DatabaseAdapter {
  return getNeonDb();
}

export async function requireCurrentUserId(request?: NextRequest): Promise<string> {
  if (request) {
    const { getClerkAuthUser } = await import('@/lib/api-auth');
    return (await getClerkAuthUser(request)).userId;
  }
  const { userId } = await auth();
  if (!userId) {
    throw createError.unauthorized();
  }
  // Reject suspended/banned accounts (admin suspend-user must actually take effect).
  const { assertAccountActive } = await import('@/lib/api-auth');
  await assertAccountActive(userId);
  return userId;
}

/**
 * PER-5 — the write-path guard for message metadata.
 *
 * This used to be a bare type check that returned the object unchanged, so a
 * multi-megabyte payload (a `data:` image URL in `metadata.imageUrl`) reached
 * the INSERT and blew up on the request body limit, surfacing as an opaque
 * "Couldn't save this response". Oversized metadata is now rejected here with
 * an actionable 400 that says what to do instead.
 */
export function normalizeMessageMetadata(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const normalized = { ...(value as Record<string, unknown>) };
  const rawCards = normalized[INTERACTIVE_CARDS_METADATA_KEY];
  if (Array.isArray(rawCards) && rawCards.length > INTERACTIVE_CARDS_MAX_PER_MESSAGE) {
    throw createError.validation(
      `Message metadata contains too many interactive cards (${rawCards.length}, limit ${INTERACTIVE_CARDS_MAX_PER_MESSAGE}).`,
    );
  }
  if (rawCards !== undefined) {
    const cards = readPersistedInteractiveCards(normalized);
    if (cards.length > 0) normalized[INTERACTIVE_CARDS_METADATA_KEY] = cards;
    else delete normalized[INTERACTIVE_CARDS_METADATA_KEY];
  }
  const length = managedCloudMetadataLength(normalized);
  if (length > MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH) {
    throw createError.validation(
      `Message metadata is too large (${length} characters, limit ${MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH}). Upload large payloads such as generated images to storage and reference them by id instead of embedding them in the message.`,
    );
  }
  return normalized;
}
