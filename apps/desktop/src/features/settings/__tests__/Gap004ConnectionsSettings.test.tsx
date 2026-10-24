import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { SETTINGS_NAV, SETTINGS_NAV_GROUPS } from '@agiworkforce/ui';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../mobile-companion/MobileCompanionPanel', () => ({
  MobileCompanionPanel: () => <div>Live mobile pairing workflow</div>,
}));

import { ConnectionsTab } from '../tabs/Connections';

describe('GAP-004 Connections settings destination', () => {
  afterEach(() => cleanup());

  it('registers one reachable Connections destination backed by the live pairing panel', () => {
    const entry = SETTINGS_NAV.find((item) => item.key === 'connections');
    const groupedKeys = SETTINGS_NAV_GROUPS.flatMap((group) => group.keys);

    expect(entry?.label).toBe('Connections');
    expect(groupedKeys).toContain('connections');

    render(<ConnectionsTab />);

    expect(screen.getByRole('heading', { name: 'Connections' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Control this Mac' })).toBeVisible();
    expect(screen.getByText('Live mobile pairing workflow')).toBeVisible();
  });

  it('removes the disconnected experimental duplicate', () => {
    expect(
      existsSync(resolve(__dirname, '..', '..', 'experimental', 'MobileCompanionPanel.tsx')),
    ).toBe(false);
  });
});
