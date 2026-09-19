/* eslint-disable @typescript-eslint/no-require-imports */
import { fireEvent, render } from '@testing-library/react-native';
import { getPlatformCapabilities } from '@agiworkforce/types';

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : icon) });
});

const mockCapabilities = { value: getPlatformCapabilities('mobile') };
jest.mock('@/src/lib/capabilities', () => ({ useCapabilities: () => mockCapabilities.value }));

jest.mock('../ShellSecondarySheet', () => {
  const { View, Pressable } = require('react-native');
  return {
    ShellSecondarySheet: ({
      controls,
    }: {
      controls: { key: string; label: string; onPress: () => void }[];
    }) => (
      <View testID="shell.secondary-sheet">
        {controls.map((control) => (
          <Pressable key={control.key} testID={`sheet.${control.key}`} onPress={control.onPress} />
        ))}
      </View>
    ),
  };
});

import { ShellCapabilityShortcuts } from '../ShellCapabilityShortcuts';

describe('ShellCapabilityShortcuts', () => {
  beforeEach(() => {
    mockCapabilities.value = getPlatformCapabilities('mobile');
  });

  it('opens a capability from the row and keeps every target reachable', () => {
    const onOpen = jest.fn();
    const { getByLabelText, queryByTestId } = render(<ShellCapabilityShortcuts onOpen={onOpen} />);

    const voice = getByLabelText('Voice');
    expect(voice.props.style.minHeight).toBeGreaterThanOrEqual(44);
    expect(queryByTestId('shell.secondary-sheet')).toBeNull();

    fireEvent.press(voice);
    expect(onOpen).toHaveBeenCalledWith('/(app)/voice');
  });

  it('puts what does not fit the row into the native sheet', () => {
    const onOpen = jest.fn();
    const { getByLabelText, getByTestId, queryByLabelText } = render(
      <ShellCapabilityShortcuts onOpen={onOpen} />,
    );

    expect(queryByLabelText('Compare')).toBeNull();
    fireEvent.press(getByLabelText('More shortcuts'));
    fireEvent.press(getByTestId('sheet.compare'));

    expect(onOpen).toHaveBeenCalledWith('/(app)/compare');
  });

  it('renders nothing where the device reaches fewer than two of them', () => {
    mockCapabilities.value = {
      ...getPlatformCapabilities('mobile'),
      canUseCamera: false,
      canUseCloudModels: false,
    };
    const { toJSON } = render(<ShellCapabilityShortcuts onOpen={jest.fn()} />);

    expect(toJSON()).toBeNull();
  });
});
