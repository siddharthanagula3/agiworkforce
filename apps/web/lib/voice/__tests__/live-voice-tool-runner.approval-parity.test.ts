// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  connectorToolPermissionsFromEntries,
  decisionTimeConnectorLevel,
  withSessionGrants,
} from '@/app/api/llm/v1/chat/completions/lib/connector-tool-permissions';
type ScanModule0 = typeof import('@/lib/user-connector-tools');
type ScanModule1 = typeof import('@/app/api/llm/v1/chat/completions/lib/tool-loop');

const mocks = vi.hoisted(() => ({
  connectorCall: vi.fn(),
  catalog: vi.fn(),
}));

vi.mock('@/lib/user-connector-tools', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  makeUserConnectorExecutor: () => mocks.connectorCall,
  loadUserConnectorToolCatalog: (...args: unknown[]) => mocks.catalog(...args),
}));
vi.mock('@/app/api/llm/v1/chat/completions/lib/tool-loop', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  recordToolCallAudit: async () => undefined,
  loadMcpToolDefs: async () => [],
}));

import { handleLiveVoiceToolCall } from '../live-voice-tool-runner';

const CONVERSATION_ID = '0190a000-0000-7000-8000-000000000005';
const POST_COMMENT = 'mcp__github__post_issue_comment';
const ARCHIVE = 'mcp__notes__archive_note';
const READ_FILE = 'mcp__onedrive__read_file';
const NEEDS_APPROVAL = [
  { connector_id: 'onedrive', tool_name: 'read_file', level: 'needs-approval' },
];
const FORGET = 'mcp__notes__forget_memory';

function voiceDb(
  saved: readonly Record<string, string>[] = [],
  grants: readonly Record<string, string>[] = [],
  temporary = false,
): DatabaseAdapter {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('connector_tool_session_grants')) return grants;
    if (sql.includes('connector_tool_permissions')) return saved;
    if (sql.includes('user_settings')) return [{ settings: {} }];
    if (sql.includes('web_conversations')) return [{ is_temporary: temporary }];
    return [];
  });
  return { query } as unknown as DatabaseAdapter;
}

function grant(connectorId: string, toolName: string, riskTier: string) {
  return { connector_id: connectorId, tool_name: toolName, risk_tier: riskTier };
}

function call(db: DatabaseAdapter, name: string, decision?: 'approved' | 'rejected') {
  return handleLiveVoiceToolCall({
    db,
    userId: 'user-1',
    organizationId: null,
    conversationId: CONVERSATION_ID,
    modelId: 'voice-backend',
    offeredTools: [name],
    call: {
      callId: 'call-1',
      name,
      arguments: '{"id":"draft-1"}',
      ...(decision ? { decision } : {}),
    },
  });
}

describe('a live voice connector approval', () => {
  beforeEach(() => {
    mocks.connectorCall.mockReset();
    mocks.connectorCall.mockResolvedValue({ handled: true, content: 'done', isError: false });
    mocks.catalog.mockReset();
    mocks.catalog.mockResolvedValue({ tools: [], dropped: [], limit: null });
  });

  it('carries the risk and reversibility review a typed approval card shows', async () => {
    const result = await call(voiceDb(), POST_COMMENT);

    expect(result).toMatchObject({
      status: 'approval_required',
      approval: {
        callId: 'call-1',
        name: POST_COMMENT,
        review: { risk_tier: 'critical', destructive: true, approval_scopes: ['once'] },
      },
    });
    expect(mocks.connectorCall).not.toHaveBeenCalled();
  });

  it('asks before a critical tool under a saved allow (defence in depth: voice already escalates every egress tool)', async () => {
    const saved = [
      { connector_id: 'github', tool_name: 'post_issue_comment', level: 'always-allow' },
    ];
    const result = await call(voiceDb(saved), POST_COMMENT);

    expect(result.status).toBe('approval_required');
    expect(mocks.connectorCall).not.toHaveBeenCalled();
  });

  it('runs the call once it is allowed on the card, and not when it is denied', async () => {
    expect((await call(voiceDb(), POST_COMMENT, 'rejected')).status).toBe('declined');
    expect(mocks.connectorCall).not.toHaveBeenCalled();

    expect((await call(voiceDb(), POST_COMMENT, 'approved')).status).toBe('completed');
    expect(mocks.connectorCall).toHaveBeenCalledOnce();
  });
});

describe('a conversation grant in a voice call', () => {
  beforeEach(() => {
    mocks.connectorCall.mockReset();
    mocks.connectorCall.mockResolvedValue({ handled: true, content: 'done', isError: false });
    mocks.catalog.mockReset();
    mocks.catalog.mockResolvedValue({ tools: [], dropped: [], limit: null });
  });

  it('lets a declared read the user set to ask run once this chat granted it', async () => {
    const without = await call(voiceDb(NEEDS_APPROVAL), READ_FILE);
    expect(without.status).toBe('approval_required');

    const granted = await call(
      voiceDb(NEEDS_APPROVAL, [grant('onedrive', 'read_file', 'low')]),
      READ_FILE,
    );
    expect(granted.status).toBe('completed');
    expect(mocks.connectorCall).toHaveBeenCalledOnce();
  });

  it('still asks before an egress tool the chat granted, because voice treats its context as untrusted', async () => {
    const result = await call(
      voiceDb([], [grant('github', 'post_issue_comment', 'critical')]),
      POST_COMMENT,
    );

    expect(result.status).toBe('approval_required');
    expect(mocks.connectorCall).not.toHaveBeenCalled();
  });

  it('asks when the grant was recorded at a lower risk than the tool now carries', async () => {
    const result = await call(
      voiceDb([], [grant('github', 'post_issue_comment', 'high')]),
      POST_COMMENT,
    );

    expect(result.status).toBe('approval_required');
    expect(mocks.connectorCall).not.toHaveBeenCalled();
  });

  it('ignores the grant in a temporary chat', async () => {
    const result = await call(
      voiceDb(NEEDS_APPROVAL, [grant('onedrive', 'read_file', 'low')], true),
      READ_FILE,
    );

    expect(result.status).toBe('approval_required');
    expect(mocks.connectorCall).not.toHaveBeenCalled();
  });
});

describe('the risk review of a remote connector tool', () => {
  beforeEach(() => {
    mocks.catalog.mockReset();
  });

  it('reads the annotations the connector published for the offered tool', async () => {
    mocks.catalog.mockResolvedValue({
      tools: [
        {
          qualifiedName: ARCHIVE,
          serverId: 'notes',
          toolName: 'archive_note',
          description: 'Archive a note',
          origin: 'connector',
          inputSchema: { type: 'object' },
          annotations: { destructiveHint: true },
        },
      ],
      dropped: [],
      limit: null,
    });

    const result = await call(voiceDb(), ARCHIVE);

    expect(result).toMatchObject({
      status: 'approval_required',
      approval: { review: { risk_tier: 'critical', destructive: true } },
    });
    const options = mocks.catalog.mock.calls[0]?.[1] as {
      isConnectorDenied: (id: string) => boolean;
    };
    expect(options.isConnectorDenied('notes')).toBe(false);
    expect(options.isConnectorDenied('github')).toBe(true);
  });

  it('rates the same tool without annotations on its declared metadata alone', async () => {
    mocks.catalog.mockResolvedValue({ tools: [], dropped: [], limit: null });

    const result = await call(voiceDb(), ARCHIVE);

    expect(result).toMatchObject({
      status: 'approval_required',
      approval: { review: { risk_tier: 'high' } },
    });
  });
});

describe('the decision-time verdict voice and typed turns share', () => {
  const allowed = connectorToolPermissionsFromEntries([
    { connectorId: 'notes', toolName: 'forget_memory', level: 'allow' },
  ]);

  it('turns a saved allow on a critical tool into a question', () => {
    expect(decisionTimeConnectorLevel(allowed, FORGET, 'critical')).toBe('ask');
    expect(decisionTimeConnectorLevel(allowed, FORGET, 'high')).toBe('allow');
  });

  it('keeps a blocked tool blocked whatever its risk', () => {
    const blocked = connectorToolPermissionsFromEntries([
      { connectorId: 'notes', toolName: 'forget_memory', level: 'deny' },
    ]);
    expect(decisionTimeConnectorLevel(blocked, FORGET, 'low')).toBe('deny');
  });

  it('honours a chat grant only while the tool carries no higher a risk than it was granted at', () => {
    const granted = withSessionGrants(
      connectorToolPermissionsFromEntries([]),
      new Map([['notes archive_note', 'high' as const]]),
    );
    expect(decisionTimeConnectorLevel(granted, ARCHIVE, 'high')).toBe('allow');
    expect(decisionTimeConnectorLevel(granted, ARCHIVE, 'critical')).toBe('ask');
  });
});
