import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const opened: string[] = [];
vi.mock('@tauri-apps/plugin-shell', () => ({
  open: async (url: string) => {
    opened.push(url);
  },
}));
vi.mock('../lib/runtimeEnvironment', () => ({ isTauri: true, isElectronHost: false }));

import { openExternalUrl } from '../utils/navigation';
import { WEB_APP_URL } from '../api/config';

const HELP_PATHS = {
  menu_help: '/help',
  menu_troubleshoot: '/help?q=troubleshooting+error+not+working',
  menu_support: '/support',
} as const;

const APP_ROOT = resolve(process.cwd());

/**
 * window_menu.rs emits menu_help, menu_troubleshoot and menu_support verbatim;
 * App.tsx had no case for any of them, so the Help menu was a silent no-op.
 */
describe('desktop Help menu actions', () => {
  beforeEach(() => {
    opened.length = 0;
  });

  it('opens a real page for every Help menu item the native menu emits', async () => {
    for (const path of Object.values(HELP_PATHS)) {
      await openExternalUrl(new URL(path, WEB_APP_URL).toString());
    }
    expect(opened).toEqual([
      new URL('/help', WEB_APP_URL).toString(),
      new URL('/help?q=troubleshooting+error+not+working', WEB_APP_URL).toString(),
      new URL('/support', WEB_APP_URL).toString(),
    ]);
  });

  it('wires every menu id the native menu emits', () => {
    const source = readFileSync(resolve(APP_ROOT, 'src/App.tsx'), 'utf8');
    for (const id of Object.keys(HELP_PATHS)) {
      expect(source, `App.tsx has no case for ${id}`).toContain(`case '${id}':`);
    }
  });

  it('keeps the native menu and the renderer on the same ids', () => {
    const menu = readFileSync(resolve(APP_ROOT, 'src-tauri/src/ui/window_menu.rs'), 'utf8');
    for (const id of Object.keys(HELP_PATHS)) {
      expect(menu, `window_menu.rs no longer emits ${id}`).toContain(id);
    }
  });
});
