import 'server-only';

import type { NextRequest } from 'next/server';
import { createError } from '@/lib/errors';
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
  organization_id?: string | null;
  title: string;
  model: string | null;
  project_id: string | null;
  pinned: boolean;
  starred: boolean;
  archived: boolean;
  is_temporary: boolean;
  active_leaf_message_id?: string | null;
  work_mode?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
};

export type ChatMessageRow = {
  id: string;
  parent_id?: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model: string | null;
  provider: string | null;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

/**
 * The mode a conversation was STARTED in, read from its earliest agent run.
 * `cloud_agent_runs` already records `work_mode` per turn under the same RLS
 * scope, so the badge needs no column of its own, and ordering by the run's
 * creation keeps a later Chat turn in an AGI Work task from retitling it.
 */
export const CONVERSATION_WORK_MODE_SELECT = `(
      select r.work_mode
        from cloud_agent_runs r
       where r.conversation_id = web_conversations.id
       order by r.created_at asc
       limit 1
    ) as work_mode`;

export async function requireCurrentUserId(request?: NextRequest): Promise<string> {
  if (request) {
    const { getClerkAuthUser } = await import('@/lib/api-auth');
    return (await getClerkAuthUser(request)).userId;
  }
  const { getRequestIdentity } = await import('@/lib/server/identity');
  const { subject: userId } = await getRequestIdentity();
  if (!userId) {
    throw createError.unauthorized();
  }
  const { assertAccountActive } = await import('@/lib/api-auth');
  await assertAccountActive(userId);
  return userId;
}

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
