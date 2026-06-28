import { describe, it, expect } from 'vitest';
import { isCapabilityEnabled } from '@agiworkforce/types';
import {
  BUILT_IN_SLASH_COMMANDS,
  filterSlashCommandsByCapability,
} from '../slash-command-registry';

const idsFor = (platform: 'web' | 'desktop' | 'mobile') =>
  filterSlashCommandsByCapability(BUILT_IN_SLASH_COMMANDS, (cap) =>
    isCapabilityEnabled(platform, cap),
  ).map((c) => c.id);

describe('slash command capability filtering', () => {
  it('drops desktop-only commands (/browser, /terminal, /database) on WEB', () => {
    const ids = idsFor('web');
    expect(ids).not.toContain('browser');
    expect(ids).not.toContain('terminal');
    expect(ids).not.toContain('database');
    // universal commands stay
    expect(ids).toContain('search');
    expect(ids).toContain('code');
    expect(ids).toContain('undo');
  });

  it('keeps desktop-only commands on DESKTOP', () => {
    const ids = idsFor('desktop');
    expect(ids).toContain('browser');
    expect(ids).toContain('terminal');
    expect(ids).toContain('database');
  });

  it('drops desktop-only commands on MOBILE', () => {
    const ids = idsFor('mobile');
    expect(ids).not.toContain('browser');
    expect(ids).not.toContain('terminal');
    expect(ids).not.toContain('database');
    expect(ids).toContain('search');
  });

  it('commands without a requiredCapability are universal', () => {
    const universal = BUILT_IN_SLASH_COMMANDS.filter((c) => !c.requiredCapability).map((c) => c.id);
    for (const platform of ['web', 'desktop', 'mobile'] as const) {
      const ids = idsFor(platform);
      for (const id of universal) expect(ids).toContain(id);
    }
  });
});
