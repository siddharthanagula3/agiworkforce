import 'server-only';

import type { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { ManagedCloudAgent } from '@agiworkforce/cloud-contracts';

import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { withRateLimit } from '@/lib/rate-limit';
import { readJsonBody } from '@/lib/read-json-body';
import { getNeonDb } from '@/lib/server/neon-db';
import { getUserScopedDb, type UserScopedDb } from '@/lib/server/rls-db';
import {
  readOwnerNames,
  toManagedCloudAgent,
  type AgentRow,
} from '@/lib/services/custom-agent-service';

export type AgentRouteContext = { params: Promise<{ id: string }> };

const AgentIdSchema = z.string().uuid();

export async function readAgentId(context: AgentRouteContext): Promise<string> {
  const { id } = await context.params;
  const parsed = AgentIdSchema.safeParse(id);
  if (!parsed.success) throw createError.notFound('Agent not found');
  return parsed.data;
}

export async function openAgentRead(
  request: NextRequest,
): Promise<{ limited: NextResponse } | { scope: UserScopedDb }> {
  const limited = await withRateLimit(request, 'chat-conversation');
  if (limited) return { limited };
  return { scope: await getUserScopedDb(request) };
}

export async function openAgentWrite(
  request: NextRequest,
): Promise<{ limited: NextResponse } | { scope: UserScopedDb }> {
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return { limited: csrfError as NextResponse };
  return openAgentRead(request);
}

export async function readAgentBody<T>(request: NextRequest, schema: z.ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(await readJsonBody(request));
  if (!parsed.success) throw createError.validation('Invalid agent request', parsed.error.issues);
  return parsed.data;
}

export async function presentAgent(userId: string, row: AgentRow): Promise<ManagedCloudAgent> {
  const names =
    row.user_id === userId
      ? new Map<string, string>()
      : await readOwnerNames(getNeonDb(), [row.user_id]);
  const agent = toManagedCloudAgent(row, userId, names.get(row.user_id) ?? null);
  if (!agent) throw createError.notFound('Agent not found');
  return agent;
}

export async function presentAgents(
  userId: string,
  rows: readonly AgentRow[],
): Promise<ManagedCloudAgent[]> {
  const names = await readOwnerNames(
    getNeonDb(),
    rows.filter((row) => row.user_id !== userId).map((row) => row.user_id),
  );
  return rows.flatMap((row) => {
    const agent = toManagedCloudAgent(row, userId, names.get(row.user_id) ?? null);
    return agent ? [agent] : [];
  });
}

export function serviceDb(): DatabaseAdapter {
  return getNeonDb();
}
