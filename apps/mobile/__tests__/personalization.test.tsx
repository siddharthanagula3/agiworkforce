/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Personalization Page — component tests
 *
 * Covers:
 *   - Renders 4 text inputs (Full Name, Nickname, Occupation, Custom Instructions)
 *   - Renders 4 sliders (Warmth, Enthusiasm, Headers/Lists, Emoji)
 *   - Save button commits to settingsStore
 *   - Pre-fills values from settingsStore
 */

import { render, fireEvent } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks — must be before component import
// ---------------------------------------------------------------------------

const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    canGoBack: jest.fn().mockReturnValue(true),
    back: mockBack,
  }),
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

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import PersonalizationScreen from '../app/(app)/settings/personalization';
import { useLocalSettingsStore } from '../stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '../stores/settings/cloudSettingsStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultPersonalization = {
  fullName: '',
  nickname: '',
  occupation: '',
  instructions: '',
  warmth: 50,
  enthusiasm: 50,
  headersLists: 50,
  emoji: 50,
};

// PersonalizationScreen reads from the active mode's store.
// Tests run in local mode (appModeStore defaults to 'local'), so seed both
// but primary reads come from useLocalSettingsStore.
function resetSettingsStore() {
  useLocalSettingsStore.setState({ personalization: defaultPersonalization });
  useCloudSettingsStore.setState({
    personalization: defaultPersonalization,
    settingsUpdatedAt: null,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Personalization page', () => {
  beforeEach(() => {
    resetSettingsStore();
    jest.clearAllMocks();
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

    // Warmth slider
    expect(getByText('Cold')).toBeTruthy();
    expect(getByText('Warm')).toBeTruthy();

    // Enthusiasm slider
    expect(getByText('Neutral')).toBeTruthy();
    expect(getByText('Enthusiastic')).toBeTruthy();

    // Headers/Lists slider
    expect(getByText('Prose')).toBeTruthy();
    expect(getByText('Structured')).toBeTruthy();

    // Emoji slider
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

    // Type into the Full Name field using its placeholder
    const nameInput = getByPlaceholderText('Your full name');
    fireEvent.changeText(nameInput, 'Alice Wonder');

    // Tap Save
    fireEvent.press(getByLabelText('Save personalization settings'));

    // Verify the store was updated (local mode → useLocalSettingsStore)
    const { personalization } = useLocalSettingsStore.getState();
    expect(personalization.fullName).toBe('Alice Wonder');
  });

  it('Save button returns to settings', () => {
    const { getByLabelText } = render(<PersonalizationScreen />);

    fireEvent.press(getByLabelText('Save personalization settings'));
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/(app)/(tabs)/settings');
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
});
