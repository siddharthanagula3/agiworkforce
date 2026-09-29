import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  executeMemoryTool: vi.fn(),
}));

vi.mock('@/lib/server/claimed-user-scope-db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/claimed-user-scope-db')>()),
  createClaimedUserScopedDb: () => ({ query: mocks.query }),
}));

vi.mock('@/lib/server/tools/memory-tools', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/tools/memory-tools')>()),
  executeMemoryTool: mocks.executeMemoryTool,
}));

import { SAVE_MEMORY_TOOL_NAME } from '@/lib/server/tools/memory-tools';
import { GOOGLE_USER_DATA_MEMORY_REFUSAL } from '@/lib/connectors/google-user-data';
import { executeOfferedToolCall } from './tool-loop';

const CONVERSATION_ID = '52d14f7e-0b3d-40c7-952d-987e841033c5';

function saveMemory(conversationId: string | null) {
  return executeOfferedToolCall({
    call: { id: 'call-1', qualifiedName: SAVE_MEMORY_TOOL_NAME, args: { fact: 'Lunch with Ana' } },
    offeredTools: new Set([SAVE_MEMORY_TOOL_NAME]),
    userId: 'user-1',
    organizationId: null,
    conversationId,
    model: 'auto',
    requestId: 'request-1',
    planTier: 'pro',
    surface: 'web',
  });
}

beforeEach(() => {
  mocks.query.mockReset();
  mocks.executeMemoryTool
    .mockReset()
    .mockResolvedValue({ content: '{"saved":true}', isError: false });
});

describe('save_memory in a conversation that holds Google user data', () => {
  it('refuses to save and never reaches the memory store', async () => {
    mocks.query.mockImplementation(async (sql: string) =>
      sql.includes('as marked') ? [{ marked: true, project_id: null }] : [],
    );

    const result = await saveMemory(CONVERSATION_ID);

    expect(result.isError).toBe(true);
    expect(result.content).toBe(GOOGLE_USER_DATA_MEMORY_REFUSAL);
    expect(mocks.executeMemoryTool).not.toHaveBeenCalled();
  });

  it('saves normally in a conversation with no Google data', async () => {
    mocks.query.mockImplementation(async (sql: string) =>
      sql.includes('as marked') ? [{ marked: false, project_id: null }] : [],
    );

    const result = await saveMemory(CONVERSATION_ID);

    expect(result.isError).toBe(false);
    expect(mocks.executeMemoryTool).toHaveBeenCalledOnce();
  });
});
