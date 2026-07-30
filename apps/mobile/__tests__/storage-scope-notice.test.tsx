/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native');
  return { Cloud: () => <Text>icon</Text> };
});

import { StorageScopeNotice } from '../src/features/settings/StorageScopeNotice';

describe('Storage scope notice', () => {
  it('does not present device bytes as an account quota', () => {
    const screen = render(<StorageScopeNotice />);

    expect(screen.getByLabelText('AGI Cloud storage. Not metered')).toBeTruthy();
    expect(screen.getByText('Not metered')).toBeTruthy();
    expect(screen.getByText(/does not currently publish a file-storage byte quota/)).toBeTruthy();
    expect(screen.getByText(/only downloaded models and cache stored on this device/)).toBeTruthy();
  });
});
