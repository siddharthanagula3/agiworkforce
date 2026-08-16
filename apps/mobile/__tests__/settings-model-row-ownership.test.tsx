import React from 'react';
import { render } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockSelectedModel = { id: '' };

jest.mock('@clerk/expo', () => ({
  useUser: () => ({ user: null, isLoaded: true }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    navigate: jest.fn(),
    canGoBack: jest.fn(() => true),
    back: jest.fn(),
  }),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '2.1.0', ios: { buildNumber: '42' } } },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : icon) });
});

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
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

jest.mock('../src/features/model-picker/store', () => ({
  useModelStore: (selector: (state: { selectedModel: string }) => unknown) =>
    selector({ selectedModel: mockSelectedModel.id }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'settings:general': 'General',
        'settings:language': 'Language',
        'settings:storage': 'Storage',
      })[key] ?? key,
    i18n: { language: 'en', resolvedLanguage: 'en' },
  }),
}));

jest.mock('@agiworkforce/i18n', () => ({
  languageFor: () => ({ code: 'en', nativeName: 'English' }),
}));

jest.mock('../src/i18n', () => ({}));

import SettingsTabScreen from '../app/(app)/(tabs)/settings';
import GeneralSettingsScreen from '../src/features/settings/general';
import {
  DEFAULT_LOCAL_MODEL_ID,
  UNKNOWN_MODEL_LABEL,
  getModelListForCloudAccess,
  getShortDisplayName,
} from '../src/features/model-picker/service';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useAuthStore } from '../src/features/auth/store';
import { useTierStore } from '../src/features/billing/store';

function collectRenderedStrings(node: unknown, out: string[] = []): string[] {
  if (node == null) return out;
  if (typeof node === 'string') {
    out.push(node);
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectRenderedStrings(child, out);
    return out;
  }
  const element = node as { children?: unknown; props?: Record<string, unknown> };
  const label = element.props?.accessibilityLabel;
  if (typeof label === 'string') out.push(label);
  collectRenderedStrings(element.children, out);
  return out;
}

describe('PAR-M21 — Settings model value ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSelectedModel.id = DEFAULT_LOCAL_MODEL_ID;
    useChatAppModeStore.setState({ appMode: 'local' });
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: false });
    useTierStore.setState({ tier: 'free', billingTier: 'free', billingStatus: 'none' } as never);
  });

  it('renders no catalog wire id anywhere on the Settings root', () => {
    const { toJSON } = render(<SettingsTabScreen />);
    const strings = collectRenderedStrings(toJSON());
    const catalogIds = getModelListForCloudAccess(true).map((model) => model.id);

    expect(catalogIds.length).toBeGreaterThan(0);
    const leaked = catalogIds.filter((id) => strings.some((text) => text.includes(id)));
    expect(leaked).toEqual([]);
  });

  it('leaves the General row without a value it does not control', () => {
    const { getByLabelText, queryByLabelText } = render(<SettingsTabScreen />);

    expect(getByLabelText('General')).toBeTruthy();
    const labelled = queryByLabelText(/^General\. /);
    expect(labelled).toBeNull();
  });

  it('puts the display name on the Models row inside General, where tapping changes it', () => {
    const expected = getShortDisplayName(DEFAULT_LOCAL_MODEL_ID, 'free');
    expect(expected).not.toBe(DEFAULT_LOCAL_MODEL_ID);

    const { getByLabelText } = render(<GeneralSettingsScreen />);

    expect(getByLabelText(`Models. ${expected}`)).toBeTruthy();
  });

  it('falls back to a neutral label, never a wire id, for a selection the catalog dropped', () => {
    mockSelectedModel.id = 'fixture-retired-model';

    const { getByLabelText, queryByText } = render(<GeneralSettingsScreen />);

    expect(getByLabelText(`Models. ${UNKNOWN_MODEL_LABEL}`)).toBeTruthy();
    expect(queryByText('fixture-retired-model')).toBeNull();
  });
});

describe('PAR-M21 — getShortDisplayName fallback', () => {
  it('returns the catalog name for a known id', () => {
    expect(getShortDisplayName(DEFAULT_LOCAL_MODEL_ID)).not.toBe(DEFAULT_LOCAL_MODEL_ID);
  });

  it('returns "Not set" rather than echoing an unknown id back to the user', () => {
    expect(getShortDisplayName('not-a-real-model-id')).toBe(UNKNOWN_MODEL_LABEL);
    expect(UNKNOWN_MODEL_LABEL).toBe('Not set');
  });
});
