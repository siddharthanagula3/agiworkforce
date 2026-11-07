// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
type ScanModule0 = typeof import('@/lib/user-connector-tools');
type ScanModule1 = typeof import('@/app/api/llm/v1/chat/completions/lib/tool-loop');

const mocks = vi.hoisted(() => ({
  connectorCall: vi.fn(),
}));

vi.mock('@/lib/user-connector-tools', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  makeUserConnectorExecutor: () => mocks.connectorCall,
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/tool-loop', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  recordToolCallAudit: async () => undefined,
}));

import { handleLiveVoiceToolCall } from '../live-voice-tool-runner';

const CONVERSATION_ID = '0190a000-0000-7000-8000-000000000004';
const ORGANIZATION_ID = '0190a000-0000-4000-8000-000000000006';
const READ_FILE = 'mcp__onedrive__read_file';
const ALWAYS_ALLOW = [{ connector_id: 'onedrive', tool_name: 'read_file', level: 'always-allow' }];

function voiceDb(
  conversation: { is_temporary: boolean } | null,
  savedVerdicts: readonly Record<string, string>[] = ALWAYS_ALLOW,
  membership: string | null = null,
): DatabaseAdapter {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('connector_tool_permissions')) return savedVerdicts;
    if (sql.includes('user_settings')) return [{ settings: {} }];
    if (sql.includes('web_conversations')) return conversation ? [conversation] : [];
    if (sql.includes('organization_members')) {
      return membership ? [{ organization_id: membership }] : [];
    }
    return [];
  });
  return { query } as unknown as DatabaseAdapter;
}

function readFile(
  db: DatabaseAdapter,
  decision?: 'approved' | 'rejected',
  organizationId: string | null = null,
) {
  return handleLiveVoiceToolCall({
    db,
    userId: 'user-1',
    organizationId,
    conversationId: CONVERSATION_ID,
    modelId: 'voice-backend',
    offeredTools: [READ_FILE],
    call: {
      callId: 'call-1',
      name: READ_FILE,
      arguments: '{"path":"budget.xlsx"}',
      ...(decision ? { decision } : {}),
    },
  });
}

describe('a live voice connector call in a temporary chat', () => {
  beforeEach(() => {
    mocks.connectorCall.mockReset();
    mocks.connectorCall.mockResolvedValue({ handled: true, content: 'found it', isError: false });
  });

  it('runs a tool the user saved as Always allow in a kept chat', async () => {
    const result = await readFile(voiceDb({ is_temporary: false }));

    expect(result.status).toBe('completed');
    expect(mocks.connectorCall).toHaveBeenCalledOnce();
  });

  it('asks before the same tool in a temporary chat, as the temporary chat note promises', async () => {
    const result = await readFile(voiceDb({ is_temporary: true }));

    expect(result).toMatchObject({
      status: 'approval_required',
      approval: { callId: 'call-1', name: READ_FILE },
    });
    expect(mocks.connectorCall).not.toHaveBeenCalled();
  });

  it('asks before a read the account default would run unasked in a kept chat', async () => {
    const kept = await readFile(voiceDb({ is_temporary: false }, []));
    const temporary = await readFile(voiceDb({ is_temporary: true }, []));

    expect(kept.status).toBe('completed');
    expect(temporary.status).toBe('approval_required');
  });

  it('runs it in a temporary chat once the user approves the card', async () => {
    const result = await readFile(voiceDb({ is_temporary: true }), 'approved');

    expect(result.status).toBe('completed');
    expect(mocks.connectorCall).toHaveBeenCalledOnce();
  });

  it.each([undefined, 'approved'] as const)(
    'blocks an unreadable conversation even with decision %s',
    async (decision) => {
      const result = await readFile(voiceDb(null), decision);

      expect(result.status).toBe('blocked');
      expect(mocks.connectorCall).not.toHaveBeenCalled();
    },
  );

  it('runs a valid conversation in its original organization with active membership', async () => {
    const db = voiceDb({ is_temporary: false }, ALWAYS_ALLOW, ORGANIZATION_ID);
    const result = await readFile(db, undefined, ORGANIZATION_ID);

    expect(result.status).toBe('completed');
    expect(mocks.connectorCall).toHaveBeenCalledOnce();
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("status = 'active'"), [
      ORGANIZATION_ID,
      'user-1',
    ]);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('organization_id is not distinct from $3::uuid'),
      [CONVERSATION_ID, 'user-1', ORGANIZATION_ID],
    );
  });

  it('blocks a missing active membership even after approval', async () => {
    const result = await readFile(voiceDb({ is_temporary: false }), 'approved', ORGANIZATION_ID);

    expect(result.status).toBe('blocked');
    expect(mocks.connectorCall).not.toHaveBeenCalled();
  });
});
