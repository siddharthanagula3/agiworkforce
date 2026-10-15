import { describe, expect, it } from 'vitest';
import type {
  DeveloperSessionGroup,
  LocalDeveloperSession,
} from '@agiworkforce/local-runtime-contract';
import {
  isLocalReviewShortcut,
  localApplyConsequence,
  localCleanupFailureRow,
  localCleanupFailuresLine,
  localDeleteSessionConsequence,
  localDiscardArchivesConsequence,
  localFolderChoices,
  localPlacementRequest,
  localRevertConsequence,
  localRewindConsequence,
  localRewindSkippedConsequence,
  localSessionDeletedLine,
  localSkippedFilesLine,
  nextSessionMarker,
  preferredLocalRootId,
  sharedUnavailableLine,
} from './local-code';

const session = (id: string, updatedAt: string): LocalDeveloperSession => ({
  id,
  rootId: 'root-1',
  title: id,
  cwd: '/work/qa-project',
  model: null,
  provider: null,
  trustMode: 'local',
  status: 'idle',
  createdAt: updatedAt,
  updatedAt,
  origin: 'desktop',
});

const folder: DeveloperSessionGroup = {
  rootId: 'root-1',
  name: 'qa-project',
  path: '/work/qa-project',
  branch: 'main',
  sessions: [session('older', '2026-10-10T09:00:00Z')],
};

const worktreeGroup: DeveloperSessionGroup = {
  rootId: 'root-1::worktree::0a1b2c3d',
  name: 'qa-project · worktree 0a1b2c3d',
  path: '/home/qa/.agiworkforce/worktrees/qa/0a1b2c3d/checkout',
  branch: null,
  sessions: [session('newer', '2026-10-10T11:00:00Z')],
  worktree: {
    id: '0a1b2c3d',
    rootId: 'root-1',
    path: '/home/qa/.agiworkforce/worktrees/qa/0a1b2c3d/checkout',
    label: null,
    start: { kind: 'ref', name: 'HEAD' },
    baseCommit: 'abc',
    createdAt: '2026-10-10T11:00:00Z',
    threadId: 'newer',
    pinned: false,
    active: false,
    missing: false,
    setupScript: null,
    setupExitCode: null,
    setupRanAt: null,
  },
};

describe('worktree groups', () => {
  it('are never offered as a folder to start a new session in', () => {
    const groups = [folder, worktreeGroup];
    expect(localFolderChoices(groups).map((choice) => choice.rootId)).toEqual(['root-1']);
    expect(preferredLocalRootId(groups)).toBe('root-1');
  });

  it('do not hide that every approved folder lacks a runtime', () => {
    const unavailable = { message: 'The AGI CLI is not installed.', hint: 'Install it.' };
    expect(sharedUnavailableLine([{ ...folder, unavailable }, worktreeGroup])).toBe(
      'The AGI CLI is not installed. Install it.',
    );
  });
});

describe('placement', () => {
  it('maps each choice to where the CLI starts the session', () => {
    expect(localPlacementRequest('local')).toEqual({ environment: 'local' });
    expect(localPlacementRequest('worktree')).toEqual({
      environment: 'worktree',
      worktreeStart: 'head',
    });
    expect(localPlacementRequest('worktree-with-changes')).toEqual({
      environment: 'worktree',
      worktreeStart: 'working_tree',
    });
  });
});

describe('consequences', () => {
  it('a rewind names the files whose current content is replaced and the messages removed', () => {
    const line = localRewindConsequence(['a.ts', 'b.ts', 'c.ts'], 2);
    expect(line).toContain('a.ts, b.ts and c.ts');
    expect(line).toContain('2 messages are removed');
    expect(line).toContain('including any edits you made since');
  });

  it('a long list names five files and counts the rest', () => {
    const files = ['1', '2', '3', '4', '5', '6', '7'].map((n) => `f${n}.ts`);
    expect(localRevertConsequence(files)).toContain(
      'f1.ts, f2.ts, f3.ts, f4.ts, f5.ts and 2 more files',
    );
  });

  it('apply says which folder files it replaces', () => {
    expect(localApplyConsequence(['src/app.ts'])).toMatch(
      /^src\/app\.ts in your folder is replaced/u,
    );
  });
});

describe('review shortcut', () => {
  const key = { key: 'G', shiftKey: true, metaKey: false, ctrlKey: false, altKey: false };

  it('answers Cmd or Ctrl with Shift and G, and nothing else', () => {
    expect(isLocalReviewShortcut({ ...key, metaKey: true })).toBe(true);
    expect(isLocalReviewShortcut({ ...key, ctrlKey: true })).toBe(true);
    expect(isLocalReviewShortcut(key)).toBe(false);
    expect(isLocalReviewShortcut({ ...key, ctrlKey: true, altKey: true })).toBe(false);
    expect(isLocalReviewShortcut({ ...key, ctrlKey: true, shiftKey: false })).toBe(false);
  });
});

describe('session markers', () => {
  it('ignore setup output, which says nothing about the turn', () => {
    expect(
      nextSessionMarker(null, {
        type: 'worktree-setup-log',
        threadId: 'newer',
        worktreeId: '0a1b2c3d',
        stream: 'stdout',
        text: 'installing',
      }),
    ).toBeUndefined();
  });
});

describe('large files a checkpoint skipped', () => {
  it('counts them in one sentence', () => {
    expect(localSkippedFilesLine(1)).toBe(
      '1 large file was not saved in this checkpoint and will not be restored.',
    );
    expect(localSkippedFilesLine(3)).toBe(
      '3 large files were not saved in this checkpoint and will not be restored.',
    );
  });

  it('names them in a rewind preview, and says nothing when there are none', () => {
    expect(localRewindSkippedConsequence([])).toBe('');
    expect(localRewindSkippedConsequence(['a.bin', 'b.bin'])).toBe(
      'a.bin and b.bin were too large to save in a checkpoint and will not be restored.',
    );
  });
});

describe('deleting a local session', () => {
  it('names what is lost, what stays, and that archives are kept', () => {
    const consequence = localDeleteSessionConsequence('Fix the build');
    expect(consequence).toContain('Fix the build is deleted from this computer');
    expect(consequence).toContain('cannot be recovered');
    expect(consequence).toContain('Files in the folder stay as they are');
    expect(consequence).toContain('archives of worktrees it used');
  });

  it('reports kept, removed and released worktrees, and only those it has', () => {
    const none = { keptWorktreeArchives: [], removedWorktreeArchives: [], releasedWorktrees: [] };
    expect(localSessionDeletedLine(none)).toBe('Session deleted.');
    expect(
      localSessionDeletedLine({
        keptWorktreeArchives: ['a'],
        removedWorktreeArchives: [],
        releasedWorktrees: ['w1', 'w2'],
      }),
    ).toBe(
      'Session deleted. The 2 worktrees it used are free for another session. 1 worktree archive with uncommitted work was kept.',
    );
    expect(localSessionDeletedLine({ ...none, removedWorktreeArchives: ['a', 'b'] })).toBe(
      'Session deleted. 2 worktree archives were deleted.',
    );
  });

  it('says discarding kept archives loses their uncommitted work for good', () => {
    expect(localDiscardArchivesConsequence(1)).toBe(
      'The kept worktree archive is deleted, and any uncommitted work in it cannot be recovered.',
    );
    expect(localDiscardArchivesConsequence(2)).toContain('The 2 kept worktree archives are');
  });
});

describe('worktree cleanup failures', () => {
  it('counts the worktrees left in place and says the session still opened', () => {
    expect(localCleanupFailuresLine([{ worktreeId: 'deadbeef', reason: 'locked' }])).toBe(
      '1 older worktree could not be archived and is still on this computer. This session runs in its new worktree.',
    );
  });

  it('reads an entry with no id as a listing that failed', () => {
    const failure = { worktreeId: '', reason: 'git worktree list failed' };
    expect(localCleanupFailuresLine([failure])).toContain('could not be checked for cleanup');
    expect(localCleanupFailureRow(failure)).toBe('git worktree list failed');
    expect(localCleanupFailureRow({ worktreeId: 'deadbeef', reason: 'locked' })).toBe(
      'deadbeef: locked',
    );
  });
});
