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

function renderCard(overrides: Partial<React.ComponentProps<typeof MemoryControlsCard>> = {}): {
  screen: ReturnType<typeof render>;
  onMemoryEnabledChange: jest.Mock;
  onReferenceChange: jest.Mock;
  onGenerateChange: jest.Mock;
} {
  const onMemoryEnabledChange = jest.fn();
  const onReferenceChange = jest.fn();
  const onGenerateChange = jest.fn();
  const screen = render(
    <MemoryControlsCard
      isCloud={false}
      memoryEnabled
      referencePastChats
      generateMemoryFromHistory
      onMemoryEnabledChange={onMemoryEnabledChange}
      onReferencePastChatsChange={onReferenceChange}
      onGenerateMemoryFromHistoryChange={onGenerateChange}
      {...overrides}
    />,
  );
  return { screen, onMemoryEnabledChange, onReferenceChange, onGenerateChange };
}

describe('MemoryControlsCard', () => {
  it('renders the master switch first and wires independent changes', () => {
    const { screen, onMemoryEnabledChange, onReferenceChange, onGenerateChange } = renderCard();

    expect(screen.getByText('Memory')).toBeTruthy();
    expect(screen.getByText('Search and reference chats')).toBeTruthy();
    expect(screen.getByText('Generate memory from chat history')).toBeTruthy();
    expect(
      screen.getByText('Use relevant chats and saved memories on this device when answering.'),
    ).toBeTruthy();

    const switches = screen.UNSAFE_getAllByType(NativeSwitch);
    expect(switches).toHaveLength(3);

    fireEvent(switches[0], 'valueChange', false);
    fireEvent(switches[1], 'valueChange', false);
    fireEvent(switches[2], 'valueChange', false);
    expect(onMemoryEnabledChange).toHaveBeenCalledWith(false);
    expect(onReferenceChange).toHaveBeenCalledWith(false);
    expect(onGenerateChange).toHaveBeenCalledWith(false);
  });

  it('shows both sub-switches off and disabled while the master switch is off', () => {
    const { screen } = renderCard({
      memoryEnabled: false,
      referencePastChats: true,
      generateMemoryFromHistory: true,
    });

    const switches = screen.UNSAFE_getAllByType(NativeSwitch);
    expect(switches[0].props).toMatchObject({ value: false, disabled: false });
    expect(switches[1].props).toMatchObject({
      value: false,
      disabled: true,
      accessibilityState: { checked: false, disabled: true },
    });
    expect(switches[2].props).toMatchObject({
      value: false,
      disabled: true,
      accessibilityState: { checked: false, disabled: true },
    });
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

  it('uses Cloud-specific copy and disables generation while reference memory is off', () => {
    const { screen } = renderCard({
      isCloud: true,
      referencePastChats: false,
      generateMemoryFromHistory: true,
    });

    expect(
      screen.getByText('Use relevant Cloud chats and saved account memories when answering.'),
    ).toBeTruthy();
    const switches = screen.UNSAFE_getAllByType(NativeSwitch);
    expect(switches[2].props).toMatchObject({
      value: true,
      disabled: true,
      accessibilityState: { checked: true, disabled: true },
    });
  });
});
