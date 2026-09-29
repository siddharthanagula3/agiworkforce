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
import {
  GOOGLE_USER_DATA_MEMORY_REFUSAL,
  GOOGLE_USER_DATA_UNROUTED_MESSAGE,
} from '@/lib/connectors/google-user-data';
import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';
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

describe('Google connector calls', () => {
  const customGoogle: WebMcpToolDef = {
    qualifiedName: 'mcp__custom-abc123__read_range',
    serverId: 'custom-abc123',
    toolName: 'read_range',
    description: 'Read a range',
    origin: 'connector',
    inputSchema: { type: 'object' },
    googleUserData: true,
  };

  function callTool(qualifiedName: string, conversationId: string | null) {
    const connectorExecutor = vi.fn(async () => ({
      handled: true as const,
      content: 'rows',
      isError: false,
    }));
    const result = executeOfferedToolCall({
      call: { id: 'call-2', qualifiedName, args: {} },
      offeredTools: new Set([qualifiedName]),
      mcpTools: [customGoogle],
      connectorExecutor,
      userId: 'user-1',
      organizationId: null,
      conversationId,
      model: 'auto',
      requestId: 'request-2',
      planTier: 'pro',
      surface: 'web',
    });
    return { result, connectorExecutor };
  }

  it.each(['mcp__gmail__search_threads', customGoogle.qualifiedName])(
    'blocks %s in a run with no conversation that was not limited to no-training models',
    async (name) => {
      const { result, connectorExecutor } = callTool(name, null);

      await expect(result).resolves.toMatchObject({
        isError: true,
        content: GOOGLE_USER_DATA_UNROUTED_MESSAGE,
      });
      expect(connectorExecutor).not.toHaveBeenCalled();
    },
  );

  it('marks the conversation before a Google-hosted custom connector runs', async () => {
    mocks.query.mockResolvedValue([]);

    const { result, connectorExecutor } = callTool(customGoogle.qualifiedName, CONVERSATION_ID);

    await expect(result).resolves.toMatchObject({ isError: false });
    const mark = mocks.query.mock.calls.find(([sql]) =>
      String(sql).includes('set google_user_data_at = now()'),
    );
    expect(mark?.[1]).toEqual([CONVERSATION_ID, 'user-1']);
    expect(connectorExecutor).toHaveBeenCalledOnce();
  });
});
