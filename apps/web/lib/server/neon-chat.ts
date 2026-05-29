import 'server-only';

import { auth } from '@clerk/nextjs/server';
import { createError } from '@/lib/errors';
import { getNeonDb } from '@/lib/server/neon-db';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

export type ChatConversationRow = {
  id: string;
  title: string;
  model: string | null;
  created_at: string;
  updated_at: string;
};

export type ChatMessageRow = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model: string | null;
  provider: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_cents: number;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

export function getNeonChatDb(): DatabaseAdapter {
  return getNeonDb();
}

export async function requireCurrentUserId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) {
    throw createError.unauthorized();
  }
  return userId;
}

export function normalizeMessageMetadata(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
