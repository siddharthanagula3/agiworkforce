import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { connectorToolPermissionsFromEntries } from '@/app/api/llm/v1/chat/completions/lib/connector-tool-permissions';
import { runsUnattendedWithoutAsking } from '../unattended-tool-gate';

const POST_COMMENT = 'mcp__github__post_issue_comment';
const READ_FILE = 'mcp__onedrive__read_file';
const ARCHIVE = 'mcp__notes__archive_note';

function allowed(connectorId: string, toolName: string) {
  return connectorToolPermissionsFromEntries([{ connectorId, toolName, level: 'allow' }]);
}

describe('runsUnattendedWithoutAsking', () => {
  it('does not treat a legacy always-allow on a critical tool as running unasked', () => {
    expect(
      runsUnattendedWithoutAsking(
        POST_COMMENT,
        'ask_every_time',
        allowed('github', 'post_issue_comment'),
      ),
    ).toBe(false);
  });

  it('runs a read the user allowed without asking', () => {
    expect(
      runsUnattendedWithoutAsking(READ_FILE, 'ask_every_time', allowed('onedrive', 'read_file')),
    ).toBe(true);
  });

  it('rates an undeclared tool by the annotations it was offered with', () => {
    const permissions = allowed('notes', 'archive_note');
    expect(runsUnattendedWithoutAsking(ARCHIVE, 'ask_every_time', permissions)).toBe(true);
    expect(
      runsUnattendedWithoutAsking(ARCHIVE, 'ask_every_time', permissions, {
        destructiveHint: true,
      }),
    ).toBe(false);
  });

  it('keeps a tool that can send data out from running unattended in a run carrying untrusted content beside a private source', () => {
    const permissions = allowed('notes', 'archive_note');
    const untrusted = { untrustedContentInContext: true, sensitiveSourceAvailable: true };

    expect(runsUnattendedWithoutAsking(ARCHIVE, 'ask_every_time', permissions)).toBe(true);
    expect(
      runsUnattendedWithoutAsking(ARCHIVE, 'ask_every_time', permissions, undefined, untrusted),
    ).toBe(false);
  });

  it('still runs an allowed read in a run carrying untrusted content', () => {
    expect(
      runsUnattendedWithoutAsking(
        READ_FILE,
        'ask_every_time',
        allowed('onedrive', 'read_file'),
        undefined,
        { untrustedContentInContext: true, sensitiveSourceAvailable: true },
      ),
    ).toBe(true);
  });

  it('never runs a blocked tool', () => {
    const blocked = connectorToolPermissionsFromEntries([
      { connectorId: 'onedrive', toolName: 'read_file', level: 'deny' },
    ]);
    expect(runsUnattendedWithoutAsking(READ_FILE, 'autonomous', blocked)).toBe(false);
  });
});
