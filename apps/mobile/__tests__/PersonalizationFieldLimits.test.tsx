/* eslint-disable @typescript-eslint/no-require-imports */

import { render } from '@testing-library/react-native';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockNavigate = jest.fn();
const mockCanGoBack = jest.fn<boolean, []>(() => true);
jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    navigate: mockNavigate,
    canGoBack: mockCanGoBack,
    back: mockBack,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View>{children}</View>;
  },
}));

jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native');
  const icon = () => <Text>icon</Text>;
  return {
    ArrowLeft: icon,
    Check: icon,
    ChevronsUpDown: icon,
    Sun: icon,
    Moon: icon,
    Monitor: icon,
  };
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

const mockOpenInAppBrowser = jest.fn(async (_url: string) => true);
jest.mock('../lib/safeOpenURL', () => ({
  openInAppBrowser: (url: string) => mockOpenInAppBrowser(url),
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
import { useAuthStore } from '../src/features/auth/store';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';

import {
  PERSONALIZATION_NICKNAME_MAX_LENGTH,
  PERSONALIZATION_OCCUPATION_MAX_LENGTH,
} from '../src/features/settings/personalization/personalizationFieldLimits';

describe('Personalization field limits', () => {
  beforeEach(() => {
    useLocalSettingsStore.setState({
      personalization: {
        fullName: '',
        nickname: '',
        occupation: '',
        instructions: '',
        style: 'default' as const,
        warmth: 50,
        enthusiasm: 50,
        headersLists: 50,
        emoji: 50,
      },
    });
    useAuthStore.setState({ clerkUserId: null });
    useChatAppModeStore.setState({ appMode: 'local' });
  });

  it('stops the nickname at the 60 characters the server keeps', () => {
    const { getByLabelText } = render(<PersonalizationScreen />);

    expect(getByLabelText('Nickname').props.maxLength).toBe(60);
    expect(PERSONALIZATION_NICKNAME_MAX_LENGTH).toBe(60);
  });

  it('stops the occupation at the 120 characters the server keeps', () => {
    const { getByLabelText } = render(<PersonalizationScreen />);

    expect(getByLabelText('Occupation').props.maxLength).toBe(120);
    expect(PERSONALIZATION_OCCUPATION_MAX_LENGTH).toBe(120);
  });

  it('leaves the full name unrestricted', () => {
    const { getByLabelText } = render(<PersonalizationScreen />);

    expect(getByLabelText('Full Name').props.maxLength).toBeUndefined();
  });
});
