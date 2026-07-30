/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native');
  return { LockKeyhole: () => <Text>icon</Text> };
});

import { SingleDesktopSessionNotice } from '../src/features/companion/components/SingleDesktopSessionNotice';

describe('Single Desktop session notice', () => {
  it('states that pairing authority is short-lived and not a saved device credential', () => {
    const screen = render(<SingleDesktopSessionNotice />);

    expect(screen.getByLabelText('One active Desktop per pairing session')).toBeTruthy();
    expect(
      screen.getByText(
        'Pairing codes and session keys are short-lived and are not saved as reusable device access.',
      ),
    ).toBeTruthy();
  });
});
