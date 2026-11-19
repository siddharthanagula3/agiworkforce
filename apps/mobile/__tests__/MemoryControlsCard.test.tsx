import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet, Switch as NativeSwitch } from 'react-native';

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
    agentError: '#cc0000',
  }),
  cardRadius: 12,
}));

const DELETION_WARNING = "Deletion didn't finish. Some memories may still be saved.";

import { MemoryControlsCard } from '../src/features/memory/components/MemoryControlsCard';

function renderCard(overrides: Partial<React.ComponentProps<typeof MemoryControlsCard>> = {}): {
  screen: ReturnType<typeof render>;
  onMemoryEnabledChange: jest.Mock;
  onReferenceChange: jest.Mock;
  onGenerateChange: jest.Mock;
  onSensitiveChange: jest.Mock;
} {
  const onMemoryEnabledChange = jest.fn();
  const onReferenceChange = jest.fn();
  const onGenerateChange = jest.fn();
  const onSensitiveChange = jest.fn();
  const screen = render(
    <MemoryControlsCard
      isCloud={false}
      memoryEnabled
      referencePastChats
      generateMemoryFromHistory
      includeSensitiveTopics={false}
      onMemoryEnabledChange={onMemoryEnabledChange}
      onReferencePastChatsChange={onReferenceChange}
      onGenerateMemoryFromHistoryChange={onGenerateChange}
      onIncludeSensitiveTopicsChange={onSensitiveChange}
      {...overrides}
    />,
  );
  return { screen, onMemoryEnabledChange, onReferenceChange, onGenerateChange, onSensitiveChange };
}

describe('MemoryControlsCard', () => {
  it('renders the master switch first and wires independent changes', () => {
    const { screen, onMemoryEnabledChange, onReferenceChange, onGenerateChange } = renderCard();

    expect(screen.getByText('Memory')).toBeTruthy();
    expect(screen.getByText('Search and reference chats')).toBeTruthy();
    expect(screen.getByText('Generate memory from chat history')).toBeTruthy();
    expect(screen.getByText('Search your other chats on this device when answering.')).toBeTruthy();

    const switches = screen.UNSAFE_getAllByType(NativeSwitch);
    expect(switches).toHaveLength(4);

    fireEvent(switches[0], 'valueChange', false);
    fireEvent(switches[1], 'valueChange', false);
    fireEvent(switches[2], 'valueChange', false);
    expect(onMemoryEnabledChange).toHaveBeenCalledWith(false);
    expect(onReferenceChange).toHaveBeenCalledWith(false);
    expect(onGenerateChange).toHaveBeenCalledWith(false);
  });

  it('offers Include sensitive topics in memory, off until the user turns it on', () => {
    const { screen, onSensitiveChange } = renderCard({ isCloud: true });

    expect(screen.getByText('Include sensitive topics in memory')).toBeTruthy();
    expect(
      screen.getByText(/from chats, not only when you say "Remember that" or add them yourself\.$/),
    ).toBeTruthy();
    const sensitive = screen.UNSAFE_getAllByType(NativeSwitch)[3];
    expect(sensitive.props).toMatchObject({ value: false, disabled: false });

    fireEvent(sensitive, 'valueChange', true);
    expect(onSensitiveChange).toHaveBeenCalledWith(true);
  });

  it('shows the stored sensitive topics choice, locked, while memory is off', () => {
    const on = renderCard({ memoryEnabled: false, includeSensitiveTopics: true });
    expect(on.screen.UNSAFE_getAllByType(NativeSwitch)[3].props).toMatchObject({
      value: true,
      disabled: true,
    });
    on.screen.unmount();

    const off = renderCard({ memoryEnabled: false, includeSensitiveTopics: false });
    expect(off.screen.UNSAFE_getAllByType(NativeSwitch)[3].props).toMatchObject({
      value: false,
      disabled: true,
    });
  });

  it('keeps chat search independent and shows the stored generation choice while the master switch is off', () => {
    const { screen } = renderCard({
      memoryEnabled: false,
      referencePastChats: true,
      generateMemoryFromHistory: true,
    });

    const switches = screen.UNSAFE_getAllByType(NativeSwitch);
    expect(switches[0].props).toMatchObject({ value: false, disabled: false });
    expect(switches[1].props).toMatchObject({ value: true, disabled: false });
    expect(switches[2].props).toMatchObject({
      value: true,
      disabled: true,
      accessibilityState: { checked: true, disabled: true },
    });
    expect(
      screen.getAllByLabelText('Generate memory from chat history. On').length,
    ).toBeGreaterThan(0);
  });

  it('shows a generation switch that is stored off as off while memory is off', () => {
    const { screen } = renderCard({ memoryEnabled: false, generateMemoryFromHistory: false });

    expect(screen.UNSAFE_getAllByType(NativeSwitch)[2].props).toMatchObject({
      value: false,
      disabled: true,
    });
  });

  it('shows no deletion warning unless one is passed', () => {
    const { screen } = renderCard();

    expect(screen.queryByText(DELETION_WARNING)).toBeNull();
    expect(screen.queryByLabelText('Dismiss')).toBeNull();
  });

  it('keeps a deletion warning under the last switch with Try again and a Dismiss that is 44 points', () => {
    const onTryAgain = jest.fn();
    const onDismiss = jest.fn();
    const { screen } = renderCard({ deletionWarning: { onTryAgain, onDismiss } });

    expect(screen.getByText(DELETION_WARNING)).toBeTruthy();
    expect(screen.UNSAFE_getAllByType(NativeSwitch)).toHaveLength(4);

    fireEvent.press(screen.getByLabelText('Try again'));
    expect(onTryAgain).toHaveBeenCalledTimes(1);

    const dismiss = screen.getByLabelText('Dismiss');
    expect(StyleSheet.flatten(dismiss.props.style)).toMatchObject({ width: 44, height: 44 });
    fireEvent.press(dismiss);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('states retention per trust boundary in both states', () => {
    const localOff = renderCard({ memoryEnabled: false });
    expect(
      localOff.screen.getByText(/Existing entries stay on this device until you delete them\./),
    ).toBeTruthy();
    localOff.screen.unmount();

    const cloudOff = renderCard({ isCloud: true, memoryEnabled: false });
    expect(
      cloudOff.screen.getByText(/Existing entries stay on your account until you delete them\./),
    ).toBeTruthy();
    cloudOff.screen.unmount();

    const cloudOn = renderCard({ isCloud: true });
    expect(cloudOn.screen.getByText(/Cloud memories are stored on your AGI account/)).toBeTruthy();
  });

  it('uses Cloud-specific copy and keeps generation independent of chat search', () => {
    const { screen } = renderCard({
      isCloud: true,
      referencePastChats: false,
      generateMemoryFromHistory: true,
    });

    expect(screen.getByText('Search your other Cloud chats when answering.')).toBeTruthy();
    const switches = screen.UNSAFE_getAllByType(NativeSwitch);
    expect(switches[1].props).toMatchObject({ value: false, disabled: false });
    expect(switches[2].props).toMatchObject({ value: true, disabled: false });
  });
});
