import React from 'react';
import { render } from '@testing-library/react-native';

import { StorageScopeNotice } from '../src/features/settings/StorageScopeNotice';

describe('Storage scope notice', () => {
  it('says the totals are device-only without describing account storage', () => {
    const screen = render(<StorageScopeNotice />);

    expect(
      screen.getByText('Totals cover only downloaded models and cache on this device.'),
    ).toBeTruthy();
    expect(screen.queryByText(/not metered/i)).toBeNull();
    expect(screen.queryByText(/AGI Cloud/i)).toBeNull();
    expect(screen.queryByLabelText(/not metered/i)).toBeNull();
  });
});
