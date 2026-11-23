import { describe, expect, it, vi } from 'vitest';
import {
  actionNeedsApproval,
  browserPermissionModeToStored,
  readBrowserPermissionMode,
  unattendedComposerTask,
} from '../src/features/computer-use/askBeforeActing';

describe('unattended browser tasks', () => {
  it('accepts both flags only as complete commands at the start of composer input', () => {
    expect(unattendedComposerTask('-yolo')).toBe('');
    expect(unattendedComposerTask('  --always-approve   read the page')).toBe('read the page');
    expect(unattendedComposerTask('-yolo click the marker')).toBe('click the marker');
    expect(unattendedComposerTask('Explain -yolo')).toBeUndefined();
    expect(unattendedComposerTask('-yolox')).toBeUndefined();
  });
  it('persists independently of the existing Full access preference', () => {
    expect(readBrowserPermissionMode(browserPermissionModeToStored('yolo'))).toBe('yolo');
    expect(readBrowserPermissionMode(false)).toBe('full');
  });
  it('admits routine work only on an approved site and preserves every protected action', async () => {
    const context = {
      mode: 'yolo' as const,
      alwaysAsk: false,
      crucial: false,
      readsOnly: false,
      allowedForTask: false,
      siteApproved: vi.fn().mockResolvedValue(true),
    };
    expect(await actionNeedsApproval(context)).toBe(false);
    expect(await actionNeedsApproval({ ...context, alwaysAsk: true, allowedForTask: true })).toBe(
      true,
    );
    expect(
      await actionNeedsApproval({
        ...context,
        readsOnly: true,
        siteApproved: vi.fn().mockResolvedValue(false),
      }),
    ).toBe(true);
    expect(
      await actionNeedsApproval({
        ...context,
        siteApproved: vi.fn().mockRejectedValue(new Error('unavailable')),
      }),
    ).toBe(true);
  });
});
