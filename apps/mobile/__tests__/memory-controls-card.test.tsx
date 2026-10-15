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
    expect(
      screen.getByText(
        'Let AGI search your other chats on this device for relevant details when answering.',
      ),
    ).toBeTruthy();

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
      screen.getByText(
        /only when you say "Remember that" in a chat on the web, desktop, mobile or Chrome, or add them yourself/,
      ),
    ).toBeTruthy();
    expect(screen.getByText(/Memories saved earlier stay until you delete them/)).toBeTruthy();
    const sensitive = screen.UNSAFE_getAllByType(NativeSwitch)[3];
    expect(sensitive.props).toMatchObject({ value: false, disabled: false });

    fireEvent(sensitive, 'valueChange', true);
    expect(onSensitiveChange).toHaveBeenCalledWith(true);
  });

  it('holds the sensitive topics switch off and disabled while memory is off', () => {
    const { screen } = renderCard({ memoryEnabled: false, includeSensitiveTopics: true });

    expect(screen.UNSAFE_getAllByType(NativeSwitch)[3].props).toMatchObject({
      value: false,
      disabled: true,
    });
  });

  it('keeps chat search independent while the master switch is off', () => {
    const { screen } = renderCard({
      memoryEnabled: false,
      referencePastChats: true,
      generateMemoryFromHistory: true,
    });

    const switches = screen.UNSAFE_getAllByType(NativeSwitch);
    expect(switches[0].props).toMatchObject({ value: false, disabled: false });
    expect(switches[1].props).toMatchObject({ value: true, disabled: false });
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

  it('uses Cloud-specific copy and keeps generation independent of chat search', () => {
    const { screen } = renderCard({
      isCloud: true,
      referencePastChats: false,
      generateMemoryFromHistory: true,
    });

    expect(
      screen.getByText(
        'Let AGI search your other Cloud chats for relevant details when answering.',
      ),
    ).toBeTruthy();
    const switches = screen.UNSAFE_getAllByType(NativeSwitch);
    expect(switches[1].props).toMatchObject({ value: false, disabled: false });
    expect(switches[2].props).toMatchObject({ value: true, disabled: false });
  });
});
