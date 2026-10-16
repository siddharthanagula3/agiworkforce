import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const online = vi.hoisted(() => ({ value: false as boolean | null }));

vi.mock('@agiworkforce/unified-chat', () => ({ useOnlineStatus: () => online.value }));

import { OfflineCaptivePortalHint, OfflineSummary } from './OfflineStatus';

describe('offline page copy', () => {
  beforeEach(() => {
    online.value = false;
  });

  it.each([false, null])('describes the lost connection while online is %s', (value) => {
    online.value = value;
    render(
      <>
        <OfflineSummary />
        <OfflineCaptivePortalHint />
      </>,
    );
    expect(screen.getByText(/cannot reach the network/)).toBeInTheDocument();
    expect(screen.getByText(/captive portal/)).toBeInTheDocument();
  });

  it('stops describing an outage once the connection is back', () => {
    online.value = true;
    render(
      <>
        <OfflineSummary />
        <OfflineCaptivePortalHint />
      </>,
    );
    expect(screen.queryByText(/cannot reach the network/)).toBeNull();
    expect(screen.queryByText(/captive portal/)).toBeNull();
    expect(screen.getByText(/Nothing you had open was lost/)).toBeInTheDocument();
  });
});
