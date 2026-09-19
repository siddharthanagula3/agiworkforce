import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const internalDetail = 'HTTP 500: SELECT secret FROM accounts; trace_id=private-trace';

vi.mock('@/lib/offline/offlineSync', () => ({
  SyncState: {
    ONLINE: 'online',
    OFFLINE: 'offline',
    SYNCING: 'syncing',
    ERROR: 'error',
  },
  initializeSyncManager: vi.fn(),
  cleanupSyncManager: vi.fn(),
  getSyncState: () => ({
    state: 'error',
    error: new Error(internalDetail),
    queuedCount: 1,
    lastSyncTime: null,
  }),
  subscribeSyncState: () => () => {},
  getStatusMessage: () => 'Sync failed',
  getStatusSeverity: () => 'error',
  isOnline: () => true,
  retrySync: vi.fn(),
}));

import { OfflineIndicator } from './OfflineIndicator';

describe('OfflineIndicator errors', () => {
  it('keeps internal sync failure details out of the visible status', async () => {
    render(<OfflineIndicator />);

    const status = await screen.findByRole('status');
    expect(status.textContent).toMatch(/Something went wrong on our side/i);
    expect(status.textContent).not.toMatch(/SELECT secret|private-trace|HTTP 500/i);
    expect(screen.getByRole('button', { name: 'Retry sync' })).toBeTruthy();
  });
});
