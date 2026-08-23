import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { APP_NAV_DESTINATIONS, buildAppNavItems } from '../app-nav-items';

function build(hiddenIds: string[], isAdmin = false) {
  return buildAppNavItems({
    pathname: '/chat',
    navigate: vi.fn(),
    onOpenCustomize: vi.fn(),
    isAdmin,
    hiddenIds,
  });
}

// Hiding a rail item must actually remove it, and must never be able to leave
// the user with no route back to their conversations.
describe('hiding sidebar destinations', () => {
  it('shows everything when nothing is hidden', () => {
    expect(build([]).map((i) => i.id)).toContain('artifacts');
  });

  it('removes a hidden destination from the rail', () => {
    const ids = build(['artifacts']).map((i) => i.id);
    expect(ids).not.toContain('artifacts');
    expect(ids).toContain('projects');
  });

  it('refuses to hide Chat even when asked directly', () => {
    // A rail without Chat has no way back to the conversation list.
    expect(build(['chat-home']).map((i) => i.id)).toContain('chat-home');
  });

  it('leaves at least Chat standing when every id is hidden', () => {
    const everything = APP_NAV_DESTINATIONS.map((d) => d.id);
    const ids = build(everything, true).map((i) => i.id);

    expect(ids).toEqual(['chat-home']);
  });

  it('ignores an unknown id rather than throwing', () => {
    expect(() => build(['not-a-destination'])).not.toThrow();
    expect(build(['not-a-destination']).length).toBe(build([]).length);
  });

  it('still hides admin from non-admins regardless of the hidden list', () => {
    expect(build([]).map((i) => i.id)).not.toContain('admin');
    expect(build([], true).map((i) => i.id)).toContain('admin');
  });

  it('marks Chat as the only non-hideable destination', () => {
    const notHideable = APP_NAV_DESTINATIONS.filter((d) => !d.hideable).map((d) => d.id);
    expect(notHideable).toEqual(['chat-home']);
  });
});

// The builder honouring `hiddenIds` is worth nothing if a shell forgets to pass
// it: the option defaults to `[]`, so the omission hides no items and throws no
// error. WebAppShell did exactly that, and the Settings toggle worked in the
// chat shell while doing nothing on every other route. Assert at the call site.
describe('every shell passes the hidden ids through', () => {
  const SHELLS = [
    'features/chat/pages/WebChatPage.tsx',
    'shared/components/layout/WebAppShell.tsx',
  ];

  const stripComments = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it.each(SHELLS)('%s passes hiddenIds to buildAppNavItems', (relative) => {
    const source = stripComments(
      readFileSync(path.resolve(__dirname, '../../../..', relative), 'utf8'),
    );
    const callIndex = source.indexOf('buildAppNavItems({');
    expect(callIndex, `${relative} does not build the nav`).toBeGreaterThan(-1);
    const call = source.slice(callIndex, source.indexOf('})', callIndex));
    expect(call).toContain('hiddenIds');
  });
});
