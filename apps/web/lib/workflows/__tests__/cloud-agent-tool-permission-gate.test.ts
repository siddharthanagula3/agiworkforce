import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const loadPermissions = vi.hoisted(() => vi.fn());
vi.mock('@/app/api/llm/v1/chat/completions/lib/connector-tool-permissions', () => ({
  loadConnectorToolPermissions: loadPermissions,
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  connectorToolNames,
  createCloudAgentToolPermissionGate,
} from '../cloud-agent-tool-permission-gate';

const GMAIL = 'mcp__gmail__send-email';
const BROWSER = 'mcp__browser-automation__navigate';
const SCREEN = 'mcp__screen-vision__click';

const db = {} as DatabaseAdapter;

function permissions(denied: readonly string[] = []) {
  loadPermissions.mockResolvedValue({
    isDenied: (name: string) => denied.includes(name),
    entries: denied.map((name) => {
      const [connectorId = '', toolName = ''] = name.replace(/^mcp__/, '').split('__');
      return { connectorId, toolName, level: 'deny' as const };
    }),
  });
}

function gate(tools: readonly string[]) {
  return createCloudAgentToolPermissionGate(db, {
    userId: 'user-1',
    connectorToolNames: new Set(tools),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  permissions();
});

describe('connectorToolNames', () => {
  it('collects only the connector-origin tools of the run', () => {
    expect(
      connectorToolNames([
        { qualifiedName: GMAIL, origin: 'connector' },
        { qualifiedName: 'web_search' },
        { qualifiedName: 'mcp__ops__deploy', origin: 'operator' },
      ]),
    ).toEqual(new Set([GMAIL]));
  });
});

describe('the fallback order a durable run may use', () => {
  it('runs a structured connector tool the account allows', async () => {
    await expect(gate([GMAIL]).refusalFor(GMAIL)).resolves.toBeNull();
  });

  it('refuses screen automation while a browser tool is offered for the same run', async () => {
    const refused = await gate([BROWSER, SCREEN]).refusalFor(SCREEN);

    expect(refused?.unavailable).toBe(true);
    expect(refused?.content).toContain(BROWSER);
  });

  it('refuses browser automation while a structured connector is offered', async () => {
    const refused = await gate([GMAIL, BROWSER]).refusalFor(BROWSER);

    expect(refused?.unavailable).toBe(true);
    expect(refused?.content).toContain(GMAIL);
  });

  it('allows the browser when nothing better is offered', async () => {
    await expect(gate([BROWSER]).refusalFor(BROWSER)).resolves.toBeNull();
  });

  it('allows screen automation when it is the only instrument the run has', async () => {
    await expect(gate([SCREEN]).refusalFor(SCREEN)).resolves.toBeNull();
  });

  it('leaves a platform tool that reaches no connector alone', async () => {
    await expect(gate([GMAIL]).refusalFor('web_search')).resolves.toBeNull();
    expect(loadPermissions).not.toHaveBeenCalled();
  });
});

describe('a fallback never bypasses a permission decision', () => {
  it('refuses screen automation around a blocked connector the run was never offered', async () => {
    permissions([GMAIL]);

    const refused = await gate([SCREEN]).refusalFor(SCREEN);

    expect(refused?.unavailable).toBe(true);
    expect(refused?.content).toContain('gmail/send-email');
  });

  it('refuses the browser around a blocked connector the run was never offered', async () => {
    permissions([GMAIL]);

    const refused = await gate([BROWSER]).refusalFor(BROWSER);

    expect(refused?.unavailable).toBe(true);
    expect(refused?.content).toContain('gmail/send-email');
  });

  it('still refuses the blocked connector tool itself', async () => {
    permissions([GMAIL]);

    const refused = await gate([GMAIL]).refusalFor(GMAIL);

    expect(refused?.content).toContain(GMAIL);
    expect(refused?.isError).toBe(true);
  });

  it('refuses every channel when the permission decision cannot be read', async () => {
    loadPermissions.mockRejectedValue(new Error('permission store unreachable'));

    await expect(gate([GMAIL, BROWSER]).refusalFor(GMAIL)).resolves.toMatchObject({
      unavailable: true,
    });
    await expect(gate([BROWSER]).refusalFor(BROWSER)).resolves.toMatchObject({
      unavailable: true,
    });
  });

  it('re-reads the decision on every dispatch rather than once per run', async () => {
    const created = gate([GMAIL]);
    await created.refusalFor(GMAIL);
    await created.refusalFor(GMAIL);

    expect(loadPermissions).toHaveBeenCalledTimes(2);
  });
});
