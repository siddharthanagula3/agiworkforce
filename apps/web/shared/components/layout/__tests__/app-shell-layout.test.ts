import { describe, expect, it } from 'vitest';
import {
  resolveShellLayout,
  SHELL_REGULAR_MIN_WIDTH,
  SHELL_TABLET_MIN_WIDTH,
} from '../app-shell-layout';

describe('resolveShellLayout', () => {
  it('gives a phone the header trigger and the modal drawer', () => {
    expect(resolveShellLayout({ width: 390, height: 844 })).toEqual({
      tier: 'compact',
      orientation: 'portrait',
      sidebarMode: 'drawer',
    });
  });

  it('gives a tablet in portrait its own tier, not the phone one', () => {
    expect(resolveShellLayout({ width: 834, height: 1112 })).toEqual({
      tier: 'tablet',
      orientation: 'portrait',
      sidebarMode: 'rail',
    });
  });

  it('splits the same tablet on rotation', () => {
    const portrait = resolveShellLayout({ width: 820, height: 1180 });
    const landscape = resolveShellLayout({ width: 1180, height: 820 });

    expect(portrait.orientation).toBe('portrait');
    expect(portrait.sidebarMode).toBe('rail');
    expect(landscape.orientation).toBe('landscape');
    expect(landscape.sidebarMode).toBe('persistent');
  });

  it('keeps a tablet landscape below the regular width on the tablet tier', () => {
    expect(resolveShellLayout({ width: 1000, height: 640 })).toEqual({
      tier: 'tablet',
      orientation: 'landscape',
      sidebarMode: 'persistent',
    });
  });

  it('treats an iPad split view as the compact shell it is sized like', () => {
    expect(resolveShellLayout({ width: 507, height: 1180 })).toMatchObject({
      tier: 'compact',
      sidebarMode: 'drawer',
    });
    expect(resolveShellLayout({ width: 981, height: 1180 })).toMatchObject({
      tier: 'tablet',
      sidebarMode: 'rail',
    });
  });

  it('holds the boundaries the breakpoints name', () => {
    expect(resolveShellLayout({ width: SHELL_TABLET_MIN_WIDTH - 1, height: 1024 }).tier).toBe(
      'compact',
    );
    expect(resolveShellLayout({ width: SHELL_TABLET_MIN_WIDTH, height: 1024 }).tier).toBe('tablet');
    expect(resolveShellLayout({ width: SHELL_REGULAR_MIN_WIDTH - 1, height: 768 }).tier).toBe(
      'tablet',
    );
    expect(resolveShellLayout({ width: SHELL_REGULAR_MIN_WIDTH, height: 768 }).tier).toBe(
      'regular',
    );
  });
});
