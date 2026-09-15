'use client';

import { useEffect, useState } from 'react';
import {
  HOST_MENU_SHORTCUTS,
  HOST_SHORTCUT_KEYS,
  HOST_SHORTCUT_PREFERENCE_KEYS,
  NO_HOST_SHORTCUT,
  describeAccelerator,
} from '@agiworkforce/local-runtime-contract';
import { useDesktopHost } from '../lib/host';

export interface HostShortcutRow {
  id: string;
  description: string;
  chord: string;
}

const CONFIGURABLE_DESCRIPTIONS: Record<(typeof HOST_SHORTCUT_KEYS)[number], string> = {
  quickAsk: 'Quick Ask',
  screenshot: 'Screenshot to chat',
  voice: 'Dictate',
};

/**
 * The chords that exist only because the page is running inside the shell.
 *
 * A native menu accelerator never reaches the page, so the shortcut sheet
 * cannot find these by listening the way it finds its own bindings: without
 * them it describes a browser tab to someone looking at a desktop window. The
 * fixed chords come from the contract the shell builds its menu from, and the
 * two configurable ones from the preferences the user set, so nothing here can
 * promise a key the shell does not actually press.
 *
 * Empty in a browser, which is what keeps the sheet unchanged on the web.
 */
export function useHostShortcuts(): readonly HostShortcutRow[] {
  const host = useDesktopHost();
  const [rows, setRows] = useState<readonly HostShortcutRow[]>([]);

  useEffect(() => {
    if (!host) {
      setRows([]);
      return undefined;
    }

    let live = true;
    const fixed = HOST_MENU_SHORTCUTS.map((shortcut) => ({
      id: shortcut.id,
      description: shortcut.description,
      chord: describeAccelerator(shortcut.accelerator, host.platform),
    }));
    setRows(fixed);

    void host
      .readPreferences()
      .then((state) => {
        if (!live) return;
        const configurable = HOST_SHORTCUT_KEYS.flatMap((key) => {
          const accelerator = state.preferences[HOST_SHORTCUT_PREFERENCE_KEYS[key]];
          if (typeof accelerator !== 'string' || accelerator === NO_HOST_SHORTCUT) return [];
          return [
            {
              id: `host-${key}`,
              description: CONFIGURABLE_DESCRIPTIONS[key],
              chord: describeAccelerator(accelerator, host.platform),
            },
          ];
        });
        setRows([...fixed, ...configurable]);
      })
      .catch(() => undefined);

    return () => {
      live = false;
    };
  }, [host]);

  return rows;
}
