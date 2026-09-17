import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/remoteControlSupport', () => ({
  REMOTE_CONTROL_UNAVAILABLE: 'Remote Control is not available in this build.',
  remoteControlSupported: () => false,
}));

import { MobileCompanionPanel } from './MobileCompanionPanel';

describe('MobileCompanionPanel', () => {
  it('names the feature Remote, the term the pairing contracts use', () => {
    render(<MobileCompanionPanel />);

    expect(screen.getByRole('heading', { level: 2, name: 'Remote' })).toBeTruthy();
    expect(screen.queryByText('Mobile Companion')).toBeNull();
  });
});
