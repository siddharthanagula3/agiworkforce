import { describe, expect, it } from 'vitest';
import manifest from '../../package.json';

describe('editor title contribution', () => {
  const menus = manifest.contributes.menus as Record<
    string,
    Array<{ command: string; when?: string; group?: string }>
  >;
  const commands = manifest.contributes.commands as Array<{ command: string; icon?: string }>;

  it('puts the open-chat icon in the editor title bar of file editors', () => {
    const entry = menus['editor/title']?.find(
      (item) => item.command === 'agi-workforce.openChatInEditor',
    );
    expect(entry?.group?.startsWith('navigation')).toBe(true);
    expect(entry?.when).toContain('resourceScheme == file');
  });

  it('gives the contributed command an icon so it renders as a button', () => {
    const command = commands.find((item) => item.command === 'agi-workforce.openChatInEditor');
    expect(command?.icon).toMatch(/^\$\(.+\)$/);
  });
});
