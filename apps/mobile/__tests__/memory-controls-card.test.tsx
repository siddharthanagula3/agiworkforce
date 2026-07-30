import { fireEvent, render } from '@testing-library/react-native';
import { Switch as NativeSwitch } from 'react-native';

jest.mock('../src/ui/theme', () => ({
  useThemeColors: () => ({
    textMuted: '#777777',
    textSecondary: '#666666',
    textPrimary: '#111111',
    surfaceElevated: '#ffffff',
    surfaceHover: '#dddddd',
    neutralSurface: '#eeeeee',
    border: '#cccccc',
    agentSuccess: '#008800',
    white: '#ffffff',
  }),
  cardRadius: 12,
}));

import { MemoryControlsCard } from '../src/features/memory/components/MemoryControlsCard';

describe('MemoryControlsCard', () => {
  it('renders both named controls and wires independent changes', () => {
    const onReferenceChange = jest.fn();
    const onGenerateChange = jest.fn();
    const screen = render(
      <MemoryControlsCard
        isCloud={false}
        referencePastChats
        generateMemoryFromHistory
        onReferencePastChatsChange={onReferenceChange}
        onGenerateMemoryFromHistoryChange={onGenerateChange}
      />,
    );

    expect(screen.getByText('Search and reference chats')).toBeTruthy();
    expect(screen.getByText('Generate memory from chat history')).toBeTruthy();
    expect(
      screen.getByText('Use relevant chats and saved memories on this device when answering.'),
    ).toBeTruthy();

    const switches = screen.UNSAFE_getAllByType(NativeSwitch);
    fireEvent(switches[0], 'valueChange', false);
    fireEvent(switches[1], 'valueChange', false);
    expect(onReferenceChange).toHaveBeenCalledWith(false);
    expect(onGenerateChange).toHaveBeenCalledWith(false);
  });

  it('uses Cloud-specific copy and disables generation while reference memory is off', () => {
    const onReferenceChange = jest.fn();
    const onGenerateChange = jest.fn();
    const screen = render(
      <MemoryControlsCard
        isCloud
        referencePastChats={false}
        generateMemoryFromHistory
        onReferencePastChatsChange={onReferenceChange}
        onGenerateMemoryFromHistoryChange={onGenerateChange}
      />,
    );

    expect(
      screen.getByText('Use relevant Cloud chats and saved account memories when answering.'),
    ).toBeTruthy();
    const switches = screen.UNSAFE_getAllByType(NativeSwitch);
    expect(switches[1].props).toMatchObject({
      value: true,
      disabled: true,
      accessibilityState: { checked: true, disabled: true },
    });
  });
});
