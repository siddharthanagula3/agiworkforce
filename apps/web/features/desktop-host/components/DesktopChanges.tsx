'use client';

import { useSyncExternalStore } from 'react';
import { getChangesPanelVisible, subscribeChangesPanel } from '../lib/changes-panel';

/** The changes panel, once View > Show Changes is on. */
export function DesktopChanges() {
  const visible = useSyncExternalStore(
    subscribeChangesPanel,
    getChangesPanelVisible,
    getChangesPanelVisible,
  );
  if (!visible) return null;

  return (
    <section aria-label="Changes" className="px-3 py-2">
      <h2 className="text-sm font-medium">Changes</h2>
      <p>No file changes</p>
    </section>
  );
}
