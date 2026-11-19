import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockToast } = vi.hoisted(() => {
  const mockToast = Object.assign(vi.fn(), { error: vi.fn() });
  return { mockToast };
});
vi.mock('sonner', () => ({ toast: mockToast }));

import {
  conversationDeleteConfirm,
  conversationHref,
  conversationShareHref,
  projectDeleteConfirm,
  toggleConversationArchive,
} from '@shared/components/layout/sidebar-session-actions';
import { projectHref, projectNewChatHref } from '@shared/components/layout/sidebar-project-actions';

const ROOT = join(__dirname, '../../..');

function source(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

interface ArchivedToastOptions {
  action: { label: string; onClick: () => void };
}

function undoArchive(): void {
  const options = mockToast.mock.lastCall?.[1] as ArchivedToastOptions | undefined;
  expect(options?.action.label).toBe('Undo');
  options!.action.onClick();
}

describe('archive a chat from the public window', () => {
  beforeEach(() => vi.clearAllMocks());

  it('gives a pinned chat its pin back when the archive is undone', async () => {
    const setArchived = vi.fn(async (_archived: boolean, _pinned?: boolean) => true);

    await toggleConversationArchive(false, setArchived, vi.fn(), true);
    undoArchive();

    await vi.waitFor(() => expect(setArchived).toHaveBeenCalledTimes(2));
    expect(setArchived).toHaveBeenNthCalledWith(1, true);
    expect(setArchived).toHaveBeenNthCalledWith(2, false, true);
  });

  it('restores an unpinned chat without pinning it', async () => {
    const setArchived = vi.fn(async (_archived: boolean, _pinned?: boolean) => true);

    await toggleConversationArchive(false, setArchived, vi.fn(), false);
    undoArchive();

    await vi.waitFor(() => expect(setArchived).toHaveBeenCalledTimes(2));
    expect(setArchived.mock.calls[1]).toEqual([false]);
  });

  it('says so when the undo does not go through', async () => {
    const setArchived = vi.fn(async (archived: boolean, _pinned?: boolean) => archived);

    await toggleConversationArchive(false, setArchived, vi.fn(), true);
    undoArchive();

    await vi.waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith('Could not restore this conversation'),
    );
  });

  it('archives a chat that is still in the list', async () => {
    const setArchived = vi.fn(async () => true);
    const openArchived = vi.fn();

    await expect(toggleConversationArchive(false, setArchived, openArchived)).resolves.toBe(true);

    expect(setArchived).toHaveBeenCalledWith(true);
    expect(openArchived).not.toHaveBeenCalled();
  });
});

describe('conversationDeleteConfirm (WEB-84)', () => {
  it('names the generated media that survives the delete', () => {
    const { description } = conversationDeleteConfirm('Trip plan');

    expect(description).toContain('“Trip plan”');
    expect(description).toContain('Images and videos generated here stay in your library');
  });

  it('does not claim a permanent erase, because the server only soft-deletes', () => {
    expect(conversationDeleteConfirm('Trip plan').description).not.toMatch(/permanent/i);
  });

  it('falls back to a neutral subject for an untitled conversation', () => {
    expect(conversationDeleteConfirm('   ').description).toMatch(/^This conversation/);
  });
});

// duplication/chat-shells.md Finding 2: the two shells' dialogs were hand-matched
// strings, and the sibling nav-items array had already drifted under exactly this
// pattern. This is the mechanism that was missing.
describe('both chat shells read their destructive copy from one definition (WEB-117)', () => {
  it.each(['features/chat/pages/WebChatPage.tsx', 'shared/components/layout/WebAppShell.tsx'])(
    '%s builds no delete dialog of its own',
    (path) => {
      const text = source(path);

      expect(text).toContain('conversationDeleteConfirm(');
      expect(text).toContain('projectDeleteConfirm(');
      expect(text).not.toContain("title: 'Delete conversation?'");
      expect(text).not.toContain("title: 'Delete project?'");
    },
  );

  it('keeps the project dialog naming the conversations that are moved, not deleted', () => {
    expect(projectDeleteConfirm('Launch').description).toContain(
      'Conversations in this project will be moved to “All Chats”',
    );
  });
});

// A row link is minted from the row's id, never its title, so renaming a
// conversation or a project cannot invalidate a link already shared or stored.
describe('shared links survive a rename', () => {
  it('addresses a conversation by id whatever its title says', () => {
    const id = 'c0ffee00-0000-4000-8000-000000000001';
    const before = conversationHref(id);

    expect(before).toContain(id);
    expect(conversationHref(id)).toBe(before);
    expect(before).not.toContain('Untitled');
  });

  it('carries a one-time share intent to the selected conversation', () => {
    expect(conversationShareHref('a b')).toBe('/chat/a%20b?share=true');
  });

  it('addresses a project by id and escapes it rather than interpolating it raw', () => {
    expect(projectHref('a b/c')).toBe('/chat/projects/a%20b%2Fc');
    expect(projectNewChatHref('a b/c')).toBe('/chat?projectId=a%20b%2Fc');
  });
});
