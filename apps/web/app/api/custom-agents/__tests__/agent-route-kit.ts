import { NextRequest, NextResponse } from 'next/server';
import { vi } from 'vitest';

import type { UserScopedDb } from '@/lib/server/rls-db';
import { AGENT_ID, OWNER } from '@/lib/agents/__tests__/agent-fixtures';

export const ORGANIZATION_ID = '0190a000-0000-7000-8000-0000000000f1';

export function agentScope(): UserScopedDb {
  return {
    db: { query: vi.fn(async () => []) },
    userId: OWNER,
    organizationId: ORGANIZATION_ID,
  } as unknown as UserScopedDb;
}

export function opened(scope: UserScopedDb = agentScope()) {
  return { scope };
}

export function refused() {
  return { limited: NextResponse.json({ error: 'refused' }, { status: 403 }) };
}

export function agentRequest(path: string, method = 'GET', body?: unknown): NextRequest {
  return new NextRequest(`https://agiworkforce.test${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
  });
}

export function agentContext(id: string = AGENT_ID) {
  return { params: Promise.resolve({ id }) };
}
