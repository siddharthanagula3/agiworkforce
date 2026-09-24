import { describe, expect, it } from 'vitest';
import {
  resolveShellLayout,
  SHELL_TABLET_MIN_WIDTH,
} from '@shared/components/layout/app-shell-layout';
import {
  CLOSED_SECONDARY_PANELS,
  resolveChatSidebarMode,
  resolveSecondaryPanel,
} from '../web-chat-layout';

describe('web chat responsive layout', () => {
  it('uses the rail at 820 portrait and whenever a tablet-sized chat opens a panel', () => {
    expect(resolveChatSidebarMode(resolveShellLayout({ width: 820, height: 1180 }), false)).toBe(
      'rail',
    );
    expect(resolveChatSidebarMode(resolveShellLayout({ width: 820, height: 640 }), true)).toBe(
      'rail',
    );
  });

  it('keeps the regular sidebar at 1024 with one secondary panel', () => {
    expect(resolveChatSidebarMode(resolveShellLayout({ width: 1024, height: 768 }), true)).toBe(
      'persistent',
    );
  });

  it('has one owner for the compact-to-tablet boundary at exactly 768px', () => {
    expect(
      resolveChatSidebarMode(
        resolveShellLayout({ width: SHELL_TABLET_MIN_WIDTH - 1, height: 1024 }),
        false,
      ),
    ).toBe('drawer');
    expect(
      resolveChatSidebarMode(
        resolveShellLayout({ width: SHELL_TABLET_MIN_WIDTH, height: 1024 }),
        false,
      ),
    ).toBe('rail');
  });

  it('moves the right slot to the newly opened research or artifacts panel', () => {
    expect(
      resolveSecondaryPanel(
        'artifacts',
        { ...CLOSED_SECONDARY_PANELS, artifacts: true },
        { ...CLOSED_SECONDARY_PANELS, artifacts: true, research: true },
      ),
    ).toBe('research');
    expect(
      resolveSecondaryPanel(
        'research',
        { ...CLOSED_SECONDARY_PANELS, research: true },
        { ...CLOSED_SECONDARY_PANELS, research: true, artifacts: true },
      ),
    ).toBe('artifacts');
  });

  it('does not let an automatic work-dock open replace the panel being read', () => {
    expect(
      resolveSecondaryPanel(
        'artifacts',
        { ...CLOSED_SECONDARY_PANELS, artifacts: true },
        { work: true, research: false, artifacts: true },
      ),
    ).toBe('artifacts');
  });
});
