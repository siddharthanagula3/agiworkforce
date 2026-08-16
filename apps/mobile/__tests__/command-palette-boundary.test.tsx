import React from 'react';
import { render } from '@testing-library/react-native';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('lucide-react-native', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  const Icon = (props: Record<string, unknown>) => <View {...props} />;
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? false : Icon) });
});

jest.mock('react-native-reanimated', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    FadeIn: { duration: () => ({}) },
    FadeOut: { duration: () => ({}) },
  };
});

import { CommandPalette } from '../src/features/chat/components/CommandPalette';

describe('CommandPalette boundary disclosure', () => {
  it('omits /compare when the host has not supplied a compare action', () => {
    const { queryByText } = render(
      <CommandPalette
        visible
        query="/"
        availableCommands={['/image', '/voice', '/export']}
        onSelectCommand={jest.fn()}
      />,
    );

    expect(queryByText('/compare')).toBeNull();
    expect(queryByText('/voice')).toBeTruthy();
  });

  it('tags /compare as a Cloud command when it is offered', () => {
    const { getByText, getByTestId, getByLabelText } = render(
      <CommandPalette
        visible
        query="/"
        availableCommands={['/image', '/voice', '/compare', '/export']}
        onSelectCommand={jest.fn()}
      />,
    );

    expect(getByText('/compare')).toBeTruthy();
    expect(getByTestId('command-palette-boundary-compare')).toBeTruthy();
    expect(getByLabelText(/Command \/compare:.*Runs on AGI Cloud\./)).toBeTruthy();
  });

  it('does not tag on-device commands with a cloud boundary', () => {
    const { queryByTestId } = render(
      <CommandPalette
        visible
        query="/"
        availableCommands={['/image', '/voice', '/export']}
        onSelectCommand={jest.fn()}
      />,
    );

    expect(queryByTestId('command-palette-boundary-voice')).toBeNull();
    expect(queryByTestId('command-palette-boundary-export')).toBeNull();
    expect(queryByTestId('command-palette-boundary-image')).toBeNull();
  });
});

describe('conversation screen withholds /compare outside the Cloud boundary', () => {
  const source = readFileSync(join(__dirname, '..', 'app', '(app)', 'chat', '[id].tsx'), 'utf8');

  it('derives the compare action from conversationExecutionMode', () => {
    expect(source).toContain(
      "const compareAction = conversationExecutionMode === 'cloud' ? handleOpenCompare : undefined;",
    );
  });

  it('passes the gated action to the composer, not the raw handler', () => {
    expect(source).toContain('onOpenCompare={compareAction}');
    expect(source).not.toContain('onOpenCompare={handleOpenCompare}');
  });
});
