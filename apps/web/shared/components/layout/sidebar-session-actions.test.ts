import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  conversationDeleteConfirm,
  projectDeleteConfirm,
} from '@shared/components/layout/sidebar-session-actions';

const ROOT = join(__dirname, '../../..');

function source(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

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
