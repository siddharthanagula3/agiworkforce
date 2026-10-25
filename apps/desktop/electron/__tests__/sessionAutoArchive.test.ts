import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DeveloperSessionGroup,
  LocalDeveloperSession,
} from '@agiworkforce/local-runtime-contract';
import {
  archiveIdleSessions,
  idleSessionsToArchive,
  resetAutoArchiveSweep,
} from '../runtime/sessionAutoArchive';

const NOW = Date.parse('2026-10-24T12:00:00Z');
const DAY = 86_400_000;

function session(id: string, ageDays: number, extra: Partial<LocalDeveloperSession> = {}) {
  return {
    id,
    rootId: 'root-1',
    title: id,
    cwd: '/work',
    model: null,
    provider: null,
    trustMode: 'managed',
    status: 'idle',
    createdAt: '',
    updatedAt: new Date(NOW - ageDays * DAY).toISOString(),
    origin: 'desktop',
    ...extra,
  } as LocalDeveloperSession;
}

function groups(sessions: LocalDeveloperSession[]): DeveloperSessionGroup[] {
  return [{ rootId: 'root-1', name: 'work', path: '/work', branch: null, sessions }];
}

beforeEach(() => resetAutoArchiveSweep());

describe('which sessions are archived for being idle', () => {
  it('takes only settled sessions older than the limit', () => {
    const due = idleSessionsToArchive(
      groups([
        session('old', 20),
        session('recent', 2),
        session('running', 40, { status: 'running' }),
        session('waiting', 40, { status: 'awaiting_approval' }),
        session('pinned', 40, { pinned: true }),
        session('cloud', 40, { location: 'cloud' }),
        session('ssh', 40, { environment: 'ssh' }),
        session('already', 40, { archivedAt: NOW - DAY }),
        session('failed', 40, { status: 'failed' }),
      ]),
      14,
      NOW,
    );
    expect(due.map((entry) => entry.id)).toEqual(['old', 'failed']);
  });

  it('archives nothing when the setting is off', () => {
    expect(idleSessionsToArchive(groups([session('old', 400)]), 0, NOW)).toEqual([]);
  });
});

describe('the sweep', () => {
  it('archives due sessions, drops them from the list, and waits before sweeping again', async () => {
    const archive = vi.fn(async () => true);
    const list = { groups: groups([session('old', 30), session('fresh', 1)]) };
    const swept = await archiveIdleSessions(list as never, {
      days: 7,
      now: NOW,
      includeArchived: false,
      archive,
    });
    expect(archive).toHaveBeenCalledTimes(1);
    expect(swept.groups[0]?.sessions.map((entry) => entry.id)).toEqual(['fresh']);

    await archiveIdleSessions(list as never, {
      days: 7,
      now: NOW + 60_000,
      includeArchived: false,
      archive,
    });
    expect(archive).toHaveBeenCalledTimes(1);
  });

  it('does not spend the sweep on a folder whose sessions were not listed yet', async () => {
    const archive = vi.fn(async () => true);
    const withheld = {
      groups: [
        {
          rootId: 'root-1',
          name: 'work',
          path: '/work',
          branch: null,
          sessions: [],
          sessionsWithheld: true,
        },
      ],
    };
    await archiveIdleSessions(withheld as never, {
      days: 7,
      now: NOW,
      includeArchived: false,
      archive,
    });
    expect(archive).not.toHaveBeenCalled();

    const listed = { groups: groups([session('old', 30)]) };
    await archiveIdleSessions(listed as never, {
      days: 7,
      now: NOW + 60_000,
      includeArchived: false,
      archive,
    });
    expect(archive).toHaveBeenCalledTimes(1);
  });

  it('keeps a session listed, marked archived, when archived ones are shown', async () => {
    const list = { groups: groups([session('old', 30)]) };
    const swept = await archiveIdleSessions(list as never, {
      days: 7,
      now: NOW,
      includeArchived: true,
      archive: async () => true,
    });
    expect(swept.groups[0]?.sessions[0]?.archivedAt).toBe(NOW);
  });

  it('leaves a session it could not archive in the list', async () => {
    const list = { groups: groups([session('old', 30)]) };
    const swept = await archiveIdleSessions(list as never, {
      days: 7,
      now: NOW,
      includeArchived: false,
      archive: async () => {
        throw new Error('busy');
      },
    });
    expect(swept.groups[0]?.sessions).toHaveLength(1);
  });
});
