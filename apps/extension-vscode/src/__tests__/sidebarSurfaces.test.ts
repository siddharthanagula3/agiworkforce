import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as vscode from 'vscode';
import {
  BUILT_IN_SLASH_COMMANDS,
  CLI_CAPABILITY_REQUIREMENT,
  CliCapabilityAdapter,
  CLOUD_TASK_ROW_ACTIONS,
  SCHEDULE_ROW_ACTIONS,
  SURFACE_MENU_ITEMS,
  buildSurfaceRows,
  composeSurfaceSections,
  mergeSessionRows,
  normalizeCapabilityEntries,
  surfaceSectionItem,
} from '../features/surfaces';
import { resolveAccountPresence, resolveAccountToken } from '../features/surfaces/accountAccess';
import { type LocalRuntimePool } from '../integrations/localRuntimePool';

function manifestCommands(): string[] {
  const manifest = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8')) as {
    contributes: { commands: { command: string }[] };
  };
  return manifest.contributes.commands.map((entry) => entry.command);
}

function poolWith(client: Record<string, unknown>): LocalRuntimePool {
  return { forWorkspace: () => client } as unknown as LocalRuntimePool;
}

function secretsWith(token: string | undefined): vscode.SecretStorage {
  const store = new Map<string, string>();
  if (token !== undefined) store.set('agiWorkforce.accountToken', token);
  return {
    get: async (key: string) => store.get(key),
    store: async () => undefined,
    delete: async () => undefined,
    onDidChange: () => ({ dispose: () => undefined }),
  } as unknown as vscode.SecretStorage;
}

describe('the overflow menu', () => {
  it('maps every item to a declared command', () => {
    const declared = new Set(manifestCommands());
    for (const item of SURFACE_MENU_ITEMS) {
      expect(declared.has(item.command)).toBe(true);
    }
  });

  it('lists the surfaces the sidebar no longer contributes as trees', () => {
    expect(SURFACE_MENU_ITEMS.map((item) => item.id)).toEqual([
      'sessions',
      'projects',
      'artifacts',
      'work',
      'connectors',
      'memory',
      'skills',
      'plugins',
      'mcp',
      'hooks',
      'instructions',
      'settings',
      'account',
    ]);
  });
});

describe('surface rows', () => {
  it('carries the tree item label, description and inline actions into the pick', () => {
    const item = new vscode.TreeItem('Migrate the ledger');
    item.description = 'Running · updated 2m ago';
    item.tooltip = 'Waiting for approval\nrun_command';
    item.iconPath = new vscode.ThemeIcon('cloud');
    item.contextValue = 'cloudRunPendingApproval';

    const [row] = buildSurfaceRows([item], CLOUD_TASK_ROW_ACTIONS);

    expect(row?.label).toBe('$(cloud) Migrate the ledger');
    expect(row?.description).toBe('Running · updated 2m ago');
    expect(row?.detail).toBe('Waiting for approval · run_command');
    expect(row?.buttons).toHaveLength(2);
  });

  it('offers approve and reject only while a run waits for a decision', () => {
    const settled = new vscode.TreeItem('Done');
    settled.contextValue = 'cloudRun';

    expect(buildSurfaceRows([settled], CLOUD_TASK_ROW_ACTIONS)[0]?.buttons).toBeUndefined();
  });

  it('offers pause only on an active schedule and resume only on a paused one', () => {
    const pause = SCHEDULE_ROW_ACTIONS.find(
      (action) => action.command === 'agi-workforce.pauseSchedule',
    );
    const resume = SCHEDULE_ROW_ACTIONS.find(
      (action) => action.command === 'agi-workforce.resumeSchedule',
    );

    expect(pause?.matches('scheduleActive')).toBe(true);
    expect(pause?.matches('schedulePaused')).toBe(false);
    expect(resume?.matches('schedulePaused')).toBe(true);
    expect(resume?.matches('scheduleActive')).toBe(false);
  });

  it('renders a composed section as a separator rather than a selectable row', async () => {
    const composed = composeSurfaceSections([
      { label: 'Cloud tasks', provider: { getChildren: async () => [] } },
    ]);

    const rows = buildSurfaceRows(await composed.getChildren(), []);

    expect(rows[0]?.kind).toBe(vscode.QuickPickItemKind.Separator);
    expect(surfaceSectionItem('Schedules').contextValue).toBe('surfaceSection');
  });
});

describe('the sessions sheet', () => {
  it('merges local and cloud rows newest first and labels each source', () => {
    const rows = mergeSessionRows(
      [
        {
          id: 'cloud_1',
          title: 'Ledger migration',
          updatedAt: '2026-09-14T11:00:00.000Z',
          source: 'cloud',
        },
        {
          id: 'local_1',
          title: 'Fix the composer',
          updatedAt: '2026-09-14T11:30:00.000Z',
          source: 'local',
        },
      ],
      Date.parse('2026-09-14T12:00:00.000Z'),
    );

    expect(rows.map((row) => row.id)).toEqual(['local_1', 'cloud_1']);
    expect(rows.map((row) => row.sourceLabel)).toEqual(['Local', 'Cloud']);
    expect(rows[0]?.age).toBe('30m ago');
  });

  it('names an untitled session rather than rendering an empty row', () => {
    const [row] = mergeSessionRows([
      { id: 'local_2', title: '   ', updatedAt: '2026-09-14T11:30:00.000Z', source: 'local' },
    ]);

    expect(row?.title).toBe('Untitled session');
  });
});

describe('the CLI capability adapter', () => {
  beforeEach(() => {
    (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
      { uri: vscode.Uri.file('/repo'), name: 'repo', index: 0 },
    ];
  });

  afterEach(() => {
    (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = undefined;
    vi.restoreAllMocks();
  });

  it('reports the CLI requirement instead of an empty list on protocol 7', async () => {
    const adapter = new CliCapabilityAdapter(poolWith({}));

    const result = await adapter.listEntries('skills');

    expect(result).toEqual({ status: 'unavailable', reason: CLI_CAPABILITY_REQUIREMENT });
  });

  it('normalizes the skill and instruction shapes the app server returns', () => {
    expect(
      normalizeCapabilityEntries({
        skills: [
          { name: 'deploy', description: 'Ship it', scope: 'project', path: '.agents/deploy' },
        ],
      }),
    ).toEqual([{ label: 'deploy', description: 'Ship it', detail: '.agents/deploy' }]);

    expect(
      normalizeCapabilityEntries({
        files: [{ path: 'AGENTS.md', kind: 'agents', bytes: 12, root: '/repo' }],
      }),
    ).toEqual([{ label: 'AGENTS.md', description: 'agents', detail: 'AGENTS.md' }]);
  });

  it('falls back to the built-in slash list when commands/list is unavailable', async () => {
    const adapter = new CliCapabilityAdapter(poolWith({}));

    const listed = await adapter.listEntries('commands');
    const names =
      listed.status === 'ok' && listed.value.length > 0
        ? listed.value.map((entry) => entry.label)
        : BUILT_IN_SLASH_COMMANDS.map((entry) => entry.name);

    expect(listed.status).toBe('unavailable');
    expect(names).toContain('/model');
    expect(names).toContain('/clear');
  });
});

describe('single sign-in', () => {
  beforeEach(() => {
    (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = [
      { uri: vscode.Uri.file('/repo'), name: 'repo', index: 0 },
    ];
  });

  afterEach(() => {
    (vscode.workspace as { workspaceFolders: unknown }).workspaceFolders = undefined;
  });

  it('prefers the identity the CLI already holds over the extension secret', async () => {
    const adapter = new CliCapabilityAdapter(
      poolWith({
        readAccountStatus: async () => ({ signedIn: true, email: 'dev@example.com', tier: 'max' }),
        readAccountToken: async () => ({ token: 'cli-token' }),
      }),
    );

    await expect(resolveAccountToken(secretsWith('extension-token'), adapter)).resolves.toEqual({
      token: 'cli-token',
      source: 'cli',
    });
    await expect(resolveAccountPresence(secretsWith(undefined), adapter)).resolves.toMatchObject({
      signedIn: true,
      source: 'cli',
    });
  });

  it('keeps the stored device-flow token when the CLI cannot answer', async () => {
    const adapter = new CliCapabilityAdapter(poolWith({}));

    await expect(resolveAccountToken(secretsWith('extension-token'), adapter)).resolves.toEqual({
      token: 'extension-token',
      source: 'extension',
    });
  });
});
