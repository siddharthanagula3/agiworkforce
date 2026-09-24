import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

import { toSidebarSessions } from '../sidebar-session-rows';
import { conversationHref, conversationShareHref } from '../sidebar-session-actions';
import { projectHref, projectNewChatHref } from '../sidebar-project-actions';

const webRoot = join(__dirname, '..', '..', '..', '..');
const appShell = readFileSync(join(__dirname, '..', 'WebAppShell.tsx'), 'utf8');
const chatShell = readFileSync(
  join(webRoot, 'features', 'chat', 'pages', 'WebChatPage.tsx'),
  'utf8',
);

/**
 * G03-14 stands in for the e2e parity spec named in the package: the two web
 * shells mount the same shared <Sidebar>, so a prop one of them passes and the
 * other does not is a kebab menu that changes with the route.
 */
function sidebarProps(source: string): string[] {
  const block = /const sharedSidebarProps = \{([\s\S]*?)\n {2}\};/.exec(source);
  if (!block?.[1]) throw new Error('sharedSidebarProps object not found');
  return [...block[1].matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1] as string).sort();
}

describe('one application shell', () => {
  it('offers the same row actions on every route', () => {
    // List chrome, not a row action: retry, paging and collapse belong to the
    // rail itself, and WebAppShell passes collapse at the <Sidebar> call site.
    const chrome = ['onRetryLoad', 'onLoadMoreSessions', 'onToggleCollapse'];
    const rowActions = (source: string) =>
      sidebarProps(source).filter((prop) => prop.startsWith('on') && !chrome.includes(prop));
    expect(rowActions(chatShell)).toEqual(rowActions(appShell));
  });

  it('pages the same recents list on every route', () => {
    for (const source of [appShell, chatShell]) {
      expect(sidebarProps(source)).toEqual(expect.arrayContaining(['onLoadMoreSessions']));
    }
  });

  it('builds both recents lists through the one projection', () => {
    for (const source of [appShell, chatShell]) {
      expect(source).toContain('toSidebarSessions(conversations, {');
      expect(source).not.toMatch(/pinned: c\.isPinned/);
    }
  });

  it('mints the sidebar row links in one place', () => {
    for (const source of [appShell, chatShell]) {
      expect(source).toContain('getSessionHref: (session: SidebarSession) =>');
      expect(source).toContain('conversationHref(session.id)');
      expect(source).not.toMatch(/`\/chat\/projects\/\$\{/);
      expect(source).not.toMatch(/`\/chat\?projectId=\$\{/);
    }
    expect(conversationHref('a b')).toBe('/chat/a%20b');
    expect(projectHref('a b')).toBe('/chat/projects/a%20b');
    expect(projectNewChatHref('a b')).toBe('/chat?projectId=a%20b');
  });

  it('sends Share from either shell to the selected conversation with its intent intact', () => {
    for (const source of [appShell, chatShell]) {
      expect(source).toContain('conversationShareHref(id)');
    }
    expect(conversationShareHref('a b')).toBe('/chat/a%20b?share=true');
  });
});

describe('sidebar session rows', () => {
  const conversations = [
    { id: 'kept', title: 'Kept', updatedAt: '2026-09-18T00:00:00.000Z', isPinned: true },
    { id: 'temp', title: 'Temporary', updatedAt: '2026-09-18T00:00:00.000Z', isTemporary: true },
  ];

  it('hides temporary conversations from the recents list', () => {
    const rows = toSidebarSessions(conversations, { isUnread: () => false });
    expect(rows.map((row) => row.id)).toEqual(['kept']);
    expect(rows[0]?.pinned).toBe(true);
  });

  it('carries the unread mark and the host decoration', () => {
    const rows = toSidebarSessions(conversations, {
      isUnread: (id) => id === 'kept',
      decorate: () => ({ runState: 'running' as const }),
    });
    expect(rows[0]?.unread).toBe(true);
    expect(rows[0]?.runState).toBe('running');
  });
});
