import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEVELOPER_SESSION_COMMANDS,
  approvedRootId,
  isDeveloperSessionEnvironment,
  isDeveloperWorktreeStart,
  parseWorktreeRootId,
  worktreeRootId,
} from '../developer-sessions';

const dispatcher = readFileSync(
  fileURLToPath(
    new URL('../../../../../apps/desktop/electron/runtime/dispatcher.ts', import.meta.url),
  ),
  'utf8',
);

describe('worktree session addresses', () => {
  it('round-trips a folder and worktree through one rootId', () => {
    const rootId = worktreeRootId('root-1', '0a1b2c3d');
    expect(parseWorktreeRootId(rootId)).toEqual({ rootId: 'root-1', worktreeId: '0a1b2c3d' });
    expect(approvedRootId(rootId)).toBe('root-1');
  });

  it('reads an approved folder id as itself', () => {
    expect(parseWorktreeRootId('root-1')).toBeNull();
    expect(approvedRootId('root-1')).toBe('root-1');
  });

  it('refuses a worktree id the CLI could not have made', () => {
    expect(parseWorktreeRootId('root-1::worktree::../../etc')).toBeNull();
    expect(parseWorktreeRootId('root-1::worktree::0A1B2C3D')).toBeNull();
    expect(parseWorktreeRootId('::worktree::0a1b2c3d')).toBeNull();
    expect(approvedRootId('root-1::worktree::nope')).toBe('root-1::worktree::nope');
  });

  it('accepts only the environments and starts a session can be placed in', () => {
    expect(isDeveloperSessionEnvironment('worktree')).toBe(true);
    expect(isDeveloperSessionEnvironment('cloud')).toBe(false);
    expect(isDeveloperWorktreeStart('working_tree')).toBe(true);
    expect(isDeveloperWorktreeStart('origin/main')).toBe(false);
  });
});

describe('worktree and checkpoint commands', () => {
  const added = [
    'developer_worktree_delete',
    'developer_worktree_pin',
    'developer_worktree_apply',
    'developer_worktree_setup_run',
    'developer_checkpoint_list',
    'developer_checkpoint_diff',
    'developer_checkpoint_revert',
    'developer_checkpoint_stage',
    'developer_thread_revert',
  ] as const;

  it('are part of the developer command contract', () => {
    for (const command of added) expect(DEVELOPER_SESSION_COMMANDS).toContain(command);
  });

  it('each have a dispatcher case and a capability the shell checks first', () => {
    for (const command of added) {
      expect(dispatcher).toContain(`case '${command}':`);
      expect(dispatcher).toMatch(new RegExp(`\\n  ${command}: \\{\\n    capability: '`));
    }
  });

  it('reads the keep count under the read gate that starts no CLI and changes it only with shell.execute', () => {
    expect(DEVELOPER_SESSION_COMMANDS).toContain('developer_worktree_keep');
    expect(dispatcher).toContain(`case 'developer_worktree_keep':`);
    expect(dispatcher).toMatch(
      /\n {2}developer_worktree_keep: \{\n {4}capability: 'shell\.execute'/u,
    );
    expect(dispatcher).toMatch(
      /command === 'developer_worktree_keep' && args\['keep'\] === undefined\) \{\n {4}return RUNNING_SESSION_READ_REQUIREMENT;/u,
    );
    expect(dispatcher).toMatch(
      /const RUNNING_SESSION_READ_REQUIREMENT: CommandRequirement = \{\n {2}capability: 'filesystem\.read',\n {2}orGranted: 'shell\.execute',/u,
    );
  });

  it('gate every change to files on git.write', () => {
    for (const command of [
      'developer_worktree_apply',
      'developer_checkpoint_revert',
      'developer_checkpoint_stage',
      'developer_thread_revert',
    ]) {
      expect(dispatcher).toMatch(
        new RegExp(`\\n  ${command}: \\{\\n    capability: 'git\\.write'`),
      );
    }
  });
});
