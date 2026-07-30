/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native');
  return { Plug: () => <Text>icon</Text> };
});

import { WorkModeSourceNotice } from '../src/features/chat/components/WorkModeSourceNotice';

describe('Work mode source notice', () => {
  it('states the request-scoped connector boundary and opens connector management', () => {
    const onOpenConnectors = jest.fn();
    const screen = render(<WorkModeSourceNotice onOpenConnectors={onOpenConnectors} />);

    expect(screen.getByLabelText('Work mode connected-source privacy')).toBeTruthy();
    expect(
      screen.getByText(
        'Work mode uses connected services only after you ask. AGI does not scan repositories or accounts in the background to generate task suggestions.',
      ),
    ).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Manage connected services'));
    expect(onOpenConnectors).toHaveBeenCalledTimes(1);
  });
});
