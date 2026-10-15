import { afterAll, describe, expect, it, vi } from 'vitest';

import { parseToolApprovalPolicy } from '@shared/types/toolApprovalPolicy';

import {
  connectorToolPermissionsFromEntries,
  EMPTY_CONNECTOR_TOOL_PERMISSIONS,
  LOCKED_DOWN_CONNECTOR_TOOL_PERMISSIONS,
  scopeConnectorPermissionsToTurn,
  withDisabledConnectorIds,
  withoutStandingApprovals,
  type ConnectorToolPermissions,
} from '../connector-tool-permissions';
import { resolveToolCallGate } from '../tool-call-gate';
import { classifyToolLoopInputs } from '../tool-loop-routing';

const OPERATOR_SERVER = vi.hoisted(() => {
  const id = 'operator-docs';
  vi.stubEnv(
    'WEB_MCP_SERVERS_JSON',
    JSON.stringify({
      servers: [
        {
          id,
          name: 'Operator docs',
          transport: { type: 'http', url: 'https://mcp.example.com/mcp' },
        },
      ],
    }),
  );
  return id;
});

afterAll(() => {
  vi.unstubAllEnvs();
});

const SAVED = connectorToolPermissionsFromEntries([
  { connectorId: 'github', toolName: 'fetch', level: 'allow' },
  { connectorId: 'notion', toolName: 'search', level: 'ask' },
  { connectorId: 'notion', toolName: 'delete', level: 'deny' },
]);

describe('withoutStandingApprovals · Temporary Chat connector policy', () => {
  it('turns a standing always-allow into an approval prompt for this chat', () => {
    const temporary = withoutStandingApprovals(SAVED);

    expect(SAVED.levelForConnectorTool('github', 'fetch')).toBe('allow');
    expect(temporary.levelForConnectorTool('github', 'fetch')).toBe('ask');
    expect(temporary.levelFor('mcp__github__fetch')).toBe('ask');
  });

  it('leaves a blocked tool blocked, so a temporary chat is not a way around a denial', () => {
    const temporary = withoutStandingApprovals(SAVED);

    expect(temporary.levelForConnectorTool('notion', 'delete')).toBe('deny');
    expect(temporary.isConnectorToolDenied('notion', 'delete')).toBe(true);
    expect(temporary.isDenied('mcp__notion__delete')).toBe(true);
  });

  it('leaves a tool that already asked alone', () => {
    expect(withoutStandingApprovals(SAVED).levelForConnectorTool('notion', 'search')).toBe('ask');
  });

  it('reports the downgraded verdicts in its entries, not the saved ones', () => {
    const entries = withoutStandingApprovals(SAVED).entries;

    expect(entries.find((entry) => entry.toolName === 'fetch')?.level).toBe('ask');
    expect(entries.find((entry) => entry.toolName === 'delete')?.level).toBe('deny');
  });

  it('does not change what the account chose: the saved verdicts are untouched', () => {
    withoutStandingApprovals(SAVED);

    expect(SAVED.levelForConnectorTool('github', 'fetch')).toBe('allow');
  });

  it('composes with the per-conversation connector opt-out', () => {
    const temporary = withDisabledConnectorIds(
      withoutStandingApprovals(SAVED),
      new Set(['github']),
    );

    expect(temporary.isConnectorToolDenied('github', 'fetch')).toBe(true);
    expect(temporary.levelForConnectorTool('notion', 'search')).toBe('ask');
  });

  it('keeps lockdown absolute', () => {
    const temporary = withoutStandingApprovals(LOCKED_DOWN_CONNECTOR_TOOL_PERMISSIONS);

    expect(temporary.isConnectorToolDenied('github', 'fetch')).toBe(true);
    expect(temporary.levelFor('mcp__github__fetch')).toBe('deny');
  });
});

describe('a temporary chat under the default account tool policy', () => {
  const READ_TOOLS = ['mcp__gmail__read_attachments', 'mcp__onedrive__read_file'];
  const policy = parseToolApprovalPolicy({});

  const OPERATOR_TOOL = `mcp__${OPERATOR_SERVER}__search_docs`;

  function gate(permissions: ConnectorToolPermissions, qualifiedName: string) {
    const { approvalMode } = classifyToolLoopInputs(
      [...READ_TOOLS, OPERATOR_TOOL].map((name) => ({
        qualifiedName: name,
        serverId: name.split('__')[1] ?? '',
        toolName: name.split('__')[2] ?? '',
        description: name,
        origin: name === OPERATOR_TOOL ? ('operator' as const) : ('connector' as const),
        inputSchema: {},
      })),
      [],
      policy,
    );
    return resolveToolCallGate(
      {
        qualifiedName,
        savedLevel: permissions.levelFor(qualifiedName),
        batchIntroducesUntrustedContent: false,
      },
      {
        approvalMode,
        toolApprovalPolicy: policy,
        unattended: false,
        deviceHostPresent: false,
        untrustedContentInContext: false,
        sensitiveSourceAvailable: true,
      },
    );
  }

  it.each(READ_TOOLS)('asks before %s even though the account default runs it unasked', (name) => {
    const temporary = scopeConnectorPermissionsToTurn(EMPTY_CONNECTOR_TOOL_PERMISSIONS, {
      temporary: true,
      disabledConnectorIds: [],
    });
    const kept = scopeConnectorPermissionsToTurn(EMPTY_CONNECTOR_TOOL_PERMISSIONS, {
      temporary: false,
      disabledConnectorIds: [],
    });

    expect(gate(kept, name).verdict).toBe('allow');
    expect(gate(temporary, name)).toMatchObject({
      verdict: 'ask',
      reason: 'user_requires_approval',
    });
  });

  it("leaves the operator's own MCP tool on the account's verdict", () => {
    const temporary = scopeConnectorPermissionsToTurn(EMPTY_CONNECTOR_TOOL_PERMISSIONS, {
      temporary: true,
      disabledConnectorIds: [],
    });
    const kept = scopeConnectorPermissionsToTurn(EMPTY_CONNECTOR_TOOL_PERMISSIONS, {
      temporary: false,
      disabledConnectorIds: [],
    });

    expect(temporary.levelFor(OPERATOR_TOOL)).toBeUndefined();
    expect(gate(temporary, OPERATOR_TOOL)).toEqual(gate(kept, OPERATOR_TOOL));
    expect(gate(temporary, 'mcp__gmail__read_attachments').verdict).toBe('ask');
  });

  it("keeps a saved verdict on the operator's own MCP tool as it was", () => {
    const saved = connectorToolPermissionsFromEntries([
      { connectorId: OPERATOR_SERVER, toolName: 'search_docs', level: 'allow' },
    ]);
    const temporary = withoutStandingApprovals(saved);

    expect(temporary.levelFor(OPERATOR_TOOL)).toBe('allow');
    expect(temporary.levelForConnectorTool(OPERATOR_SERVER, 'search_docs')).toBe('allow');
    expect(temporary.entries).toEqual(saved.entries);
  });

  it('keeps a blocked connector tool blocked', () => {
    const temporary = withoutStandingApprovals(
      connectorToolPermissionsFromEntries([
        { connectorId: 'gmail', toolName: 'read_attachments', level: 'deny' },
      ]),
    );

    expect(gate(temporary, 'mcp__gmail__read_attachments').verdict).toBe('deny');
  });

  it('leaves a tool that is not a connector tool to the account policy, lockdown included', () => {
    expect(withoutStandingApprovals(SAVED).levelFor('web_search')).toBeUndefined();
    expect(
      withoutStandingApprovals(LOCKED_DOWN_CONNECTOR_TOOL_PERMISSIONS).levelFor('web_search'),
    ).toBe('deny');
  });
});
