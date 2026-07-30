/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native');
  return { FolderLock: () => <Text>icon</Text> };
});

import { RemoteWorkspaceBoundaryNotice } from '../src/features/companion/components/RemoteWorkspaceBoundaryNotice';

describe('Remote workspace boundary notice', () => {
  it('states that pairing does not grant remote filesystem authority', () => {
    const screen = render(<RemoteWorkspaceBoundaryNotice />);

    expect(screen.getByLabelText('Desktop folders stay Desktop-controlled')).toBeTruthy();
    expect(
      screen.getByText(
        'Pairing does not let this phone browse files or projects. Choose allowed folders and start path-scoped work on Desktop.',
      ),
    ).toBeTruthy();
  });
});
