import { fireEvent, render } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSettingsStore } from '../stores/settingsStore';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { TemporaryChatBanner } from '../src/features/chat/components/TemporaryChatBanner';
import { TemporaryChatToggle } from '../src/features/chat/components/TemporaryChatToggle';

describe('temporary chat explainer', () => {
  beforeEach(() => {
    useSettingsStore.setState({ isTemporaryChat: true });
    useChatAppModeStore.setState({ appMode: 'cloud' });
  });

  it('ends with an underlined Learn more link that opens the data-use settings page', () => {
    const { getByText, getByRole } = render(<TemporaryChatBanner />);
    const link = getByText('Learn more');

    expect(link.props.accessibilityRole).toBe('link');
    expect(link.props.style.textDecorationLine).toBe('underline');
    expect(getByRole('link')).toBe(link);

    fireEvent.press(link);
    expect(useRouter().push).toHaveBeenCalledWith('/(app)/settings/cloud-privacy');
  });
});

describe('temporary chat toggle', () => {
  it('turns temporary mode off in place without navigating away', () => {
    useSettingsStore.setState({ isTemporaryChat: true });
    const { getByLabelText } = render(<TemporaryChatToggle />);

    fireEvent.press(getByLabelText('Temporary chat active'));

    expect(useSettingsStore.getState().isTemporaryChat).toBe(false);
  });

  it('asks before turning temporary mode on and names what it does', () => {
    useSettingsStore.setState({ isTemporaryChat: false });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { getByLabelText } = render(<TemporaryChatToggle />);

    fireEvent.press(getByLabelText('Enable temporary chat'));

    expect(alert).toHaveBeenCalledWith(
      'Turn on temporary chat?',
      expect.stringContaining('deleted after 30 days'),
      expect.any(Array),
    );
    expect(useSettingsStore.getState().isTemporaryChat).toBe(false);
    alert.mockRestore();
  });
});
