/* eslint-disable @typescript-eslint/no-require-imports */

import { Alert } from 'react-native';
import { act, render, fireEvent } from '@testing-library/react-native';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockNavigate = jest.fn();
const mockCanGoBack = jest.fn<boolean, []>(() => true);
const mockUseLocalSearchParams = jest.fn(() => ({}) as { scope?: string });
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    navigate: mockNavigate,
    canGoBack: mockCanGoBack,
    back: mockBack,
  }),
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View>{children}</View>;
  },
}));

jest.mock('@react-native-community/slider', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: { value?: number; testID?: string }) => (
      <View testID={props.testID ?? 'slider'} accessibilityValue={{ now: props.value }} />
    ),
  };
});

jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native');
  const icon = () => <Text>icon</Text>;
  return { ArrowLeft: icon, Check: icon, Sun: icon, Moon: icon, Monitor: icon };
});

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store, _name) => {
    if (store && store.persist && typeof store.persist.rehydrate === 'function')
      store.persist.rehydrate();
  }),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(async () => null),
  getAuthHeaders: jest.fn(async () => ({})),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
  getCurrentUser: jest.fn(async () => null),
  getCurrentUserId: jest.fn(async () => null),
}));

import PersonalizationScreen from '../app/(app)/settings/personalization';
import { useLocalSettingsStore } from '../stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '../stores/settings/cloudSettingsStore';
import { useAuthStore } from '../src/features/auth/store';

const defaultPersonalization = {
  fullName: '',
  nickname: '',
  occupation: '',
  instructions: '',
  style: 'default' as const,
  warmth: 50,
  enthusiasm: 50,
  headersLists: 50,
  emoji: 50,
};

function resetSettingsStore() {
  useLocalSettingsStore.setState({ personalization: defaultPersonalization });
  useCloudSettingsStore.setState({
    personalization: defaultPersonalization,
    settingsUpdatedAt: null,
  });
}

describe('Personalization page', () => {
  beforeEach(() => {
    resetSettingsStore();
    useAuthStore.setState({ clerkUserId: null });
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
    mockUseLocalSearchParams.mockReturnValue({});
  });

  it('renders the Personalization header', () => {
    const { getByText } = render(<PersonalizationScreen />);
    expect(getByText('Personalization')).toBeTruthy();
  });

  it('renders 4 text input labels', () => {
    const { getByText } = render(<PersonalizationScreen />);

    expect(getByText('Full Name')).toBeTruthy();
    expect(getByText('Nickname')).toBeTruthy();
    expect(getByText('Occupation')).toBeTruthy();
    expect(getByText('Custom Instructions')).toBeTruthy();
  });

  it('renders 4 slider labels', () => {
    const { getByText } = render(<PersonalizationScreen />);

    expect(getByText('Warmth')).toBeTruthy();
    expect(getByText('Enthusiasm')).toBeTruthy();
    expect(getByText('Headers / Lists')).toBeTruthy();
    expect(getByText('Emoji')).toBeTruthy();
  });

  it('renders slider range labels', () => {
    const { getByText } = render(<PersonalizationScreen />);

    expect(getByText('Cold')).toBeTruthy();
    expect(getByText('Warm')).toBeTruthy();

    expect(getByText('Neutral')).toBeTruthy();
    expect(getByText('Enthusiastic')).toBeTruthy();

    expect(getByText('Prose')).toBeTruthy();
    expect(getByText('Structured')).toBeTruthy();

    expect(getByText('None')).toBeTruthy();
    expect(getByText('Frequent')).toBeTruthy();
  });

  it('pre-fills text inputs from settingsStore', () => {
    useLocalSettingsStore.setState({
      personalization: {
        fullName: 'John Doe',
        nickname: 'JD',
        occupation: 'Engineer',
        instructions: 'Be brief',
        style: 'default',
        warmth: 50,
        enthusiasm: 50,
        headersLists: 50,
        emoji: 50,
      },
    });

    const { getByDisplayValue } = render(<PersonalizationScreen />);

    expect(getByDisplayValue('John Doe')).toBeTruthy();
    expect(getByDisplayValue('JD')).toBeTruthy();
    expect(getByDisplayValue('Engineer')).toBeTruthy();
    expect(getByDisplayValue('Be brief')).toBeTruthy();
  });

  it('Save button commits text changes to settingsStore', () => {
    const { getByPlaceholderText, getByLabelText } = render(<PersonalizationScreen />);

    const nameInput = getByPlaceholderText('Your full name');
    fireEvent.changeText(nameInput, 'Alice Wonder');

    fireEvent.press(getByLabelText('Save personalization settings'));

    const { personalization } = useLocalSettingsStore.getState();
    expect(personalization.fullName).toBe('Alice Wonder');
  });

  it('Save pops back to whichever screen pushed it', () => {
    mockCanGoBack.mockReturnValue(true);
    const { getByLabelText } = render(<PersonalizationScreen />);

    fireEvent.press(getByLabelText('Save personalization settings'));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('Save falls back to the Settings root only on a deep link with no history', () => {
    mockCanGoBack.mockReturnValue(false);
    const { getByLabelText } = render(<PersonalizationScreen />);

    fireEvent.press(getByLabelText('Save personalization settings'));

    expect(mockNavigate).toHaveBeenCalledWith('/(app)/(tabs)/settings');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('renders the Save button', () => {
    const { getByText } = render(<PersonalizationScreen />);

    const saveText = getByText('Save');
    expect(saveText).toBeTruthy();
  });

  it('renders the Response Style section header', () => {
    const { getByText } = render(<PersonalizationScreen />);
    expect(getByText('Response Style')).toBeTruthy();
  });

  it('resyncs editable fields (not stale scope-crossed data) when ?scope= changes on a reused screen instance', () => {
    useLocalSettingsStore.setState({
      personalization: { ...defaultPersonalization, fullName: 'Local Name' },
    });
    useCloudSettingsStore.setState({
      personalization: { ...defaultPersonalization, fullName: 'Cloud Name' },
      settingsUpdatedAt: null,
    });

    mockUseLocalSearchParams.mockReturnValue({ scope: 'local' });
    const { getByDisplayValue, getByText, rerender } = render(<PersonalizationScreen />);
    expect(getByDisplayValue('Local Name')).toBeTruthy();
    expect(getByText('Personalization')).toBeTruthy();

    mockUseLocalSearchParams.mockReturnValue({ scope: 'cloud' });
    rerender(<PersonalizationScreen />);

    expect(getByDisplayValue('Cloud Name')).toBeTruthy();
    expect(getByText('Cloud Personalization')).toBeTruthy();
  });

  it('hydrates a pristine Cloud draft when the first server pull arrives after mount', () => {
    mockUseLocalSearchParams.mockReturnValue({ scope: 'cloud' });
    const { getByDisplayValue } = render(<PersonalizationScreen />);

    act(() => {
      useCloudSettingsStore.setState({
        personalization: {
          ...defaultPersonalization,
          fullName: 'Server Name',
          nickname: 'Synced',
        },
      });
    });

    expect(getByDisplayValue('Server Name')).toBeTruthy();
    expect(getByDisplayValue('Synced')).toBeTruthy();
  });

  it('does not overwrite an edited Cloud draft when a later server pull arrives', () => {
    mockUseLocalSearchParams.mockReturnValue({ scope: 'cloud' });
    const { getByDisplayValue, getByPlaceholderText } = render(<PersonalizationScreen />);

    fireEvent.changeText(getByPlaceholderText('Your full name'), 'Unsaved Draft');
    act(() => {
      useCloudSettingsStore.setState({
        personalization: {
          ...defaultPersonalization,
          fullName: 'Later Server Name',
        },
      });
    });

    expect(getByDisplayValue('Unsaved Draft')).toBeTruthy();
  });

  it('discards an account-A dirty draft when the active Cloud owner changes to B', () => {
    mockUseLocalSearchParams.mockReturnValue({ scope: 'cloud' });
    useAuthStore.setState({ clerkUserId: 'account-a' });
    useCloudSettingsStore.setState({
      personalization: { ...defaultPersonalization, fullName: 'Account A' },
    });
    const { getByDisplayValue, getByPlaceholderText } = render(<PersonalizationScreen />);

    fireEvent.changeText(getByPlaceholderText('Your full name'), 'Account A unsaved private draft');
    act(() => {
      useCloudSettingsStore.setState({
        personalization: { ...defaultPersonalization, fullName: 'Account B' },
      });
      useAuthStore.setState({ clerkUserId: 'account-b' });
    });

    expect(getByDisplayValue('Account B')).toBeTruthy();
    expect(() => getByDisplayValue('Account A unsaved private draft')).toThrow();
  });
});

describe('Personalization theme card removal', () => {
  beforeEach(() => {
    resetSettingsStore();
    useAuthStore.setState({ clerkUserId: null });
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
    mockUseLocalSearchParams.mockReturnValue({});
  });

  it('renders no appearance control at all', () => {
    const { queryByText, queryByLabelText } = render(<PersonalizationScreen />);

    expect(queryByText('Theme')).toBeNull();
    expect(queryByText('System follows your device appearance setting.')).toBeNull();
    for (const label of ['Light', 'Dark', 'System']) {
      expect(queryByLabelText(label)).toBeNull();
    }
  });

  it('leaves the stored theme untouched when a draft edit is discarded', () => {
    const originalSetThemeMode = useLocalSettingsStore.getState().setThemeMode;
    const setThemeMode = jest.fn();
    useLocalSettingsStore.setState({ themeMode: 'dark', setThemeMode } as never);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    try {
      const { getByLabelText, getByPlaceholderText } = render(<PersonalizationScreen />);

      fireEvent.changeText(getByPlaceholderText('Your full name'), 'Draft only');
      fireEvent.press(getByLabelText('Go back'));

      expect(alertSpy).toHaveBeenCalledWith(
        'Discard changes?',
        'You have unsaved changes.',
        expect.any(Array),
      );
      const buttons = alertSpy.mock.calls[0][2] as { text?: string; onPress?: () => void }[];
      const discard = buttons.find((button) => button.text === 'Discard');
      act(() => discard?.onPress?.());

      expect(mockBack).toHaveBeenCalledTimes(1);
      expect(setThemeMode).not.toHaveBeenCalled();
      expect(useLocalSettingsStore.getState().themeMode).toBe('dark');
      expect(useLocalSettingsStore.getState().personalization.fullName).toBe('');
    } finally {
      alertSpy.mockRestore();
      useLocalSettingsStore.setState({ setThemeMode: originalSetThemeMode } as never);
    }
  });
});
