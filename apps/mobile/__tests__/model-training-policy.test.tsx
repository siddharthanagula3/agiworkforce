import React from 'react';
import { act, render } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: jest.fn(),
    canGoBack: jest.fn().mockReturnValue(true),
    back: jest.fn(),
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock(
  'lucide-react-native',
  () => new Proxy({}, { get: () => jest.fn().mockReturnValue(null) }),
);

jest.mock('../stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: { hapticsEnabled: boolean }) => unknown) =>
    selector({ hapticsEnabled: false }),
}));

jest.mock('../src/features/waitlist/store', () => ({
  useWaitlistStore: (selector: (state: { cloudUnlocked: boolean }) => unknown) =>
    selector({ cloudUnlocked: false }),
}));

jest.mock('../lib/safeOpenURL', () => ({
  openExternalUrl: jest.fn(),
}));

import DataControlsScreen from '../src/features/settings/data-controls';
import CloudPrivacyScreen from '../src/features/settings/cloud-privacy';
import * as apiService from '../services/api';
import * as preferencesService from '../services/preferences';

describe('model-training privacy policy', () => {
  beforeEach(() => {
    const unavailable = new Error('Cloud settings are unavailable in this disclosure test');
    jest.spyOn(apiService, 'apiFetch').mockRejectedValue(unavailable);
    jest.spyOn(apiService.api, 'get').mockRejectedValue(unavailable);
    jest.spyOn(preferencesService, 'fetchPreferenceNamespace').mockRejectedValue(unavailable);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const policyLead =
    'AGI does not use your prompts, responses or files to train AGI-owned models. On the Free plan, requests are served by providers’ free models, and those providers’ terms may allow them to train on what you send, unless you turn on Only use models that do not train on your chats';

  it('states the AGI-owned policy and the free-model caveat in Data Controls', () => {
    const { getByText, queryByRole } = render(<DataControlsScreen />);

    expect(getByText('Model training')).toBeTruthy();
    expect(getByText(`${policyLead} in Privacy settings.`)).toBeTruthy();
    expect(queryByRole('switch', { name: /model training/i })).toBeNull();
  });

  it('removes the ambiguous consent promise from Cloud Privacy', async () => {
    const { getAllByText, getByText, queryByText } = render(<CloudPrivacyScreen />);
    await act(async () => {});

    expect(getAllByText('Model training')).toHaveLength(2);
    expect(getByText(`${policyLead} below.`)).toBeTruthy();
    expect(getByText('Only use models that do not train on your chats')).toBeTruthy();
    expect(queryByText(/without explicit consent/i)).toBeNull();
  });

  it('separates on-device dictation and Local speech from Cloud read aloud', async () => {
    const { getByText, queryByText } = render(<CloudPrivacyScreen />);
    await act(async () => {});

    expect(getByText('Speech recognition runs on this device.')).toBeTruthy();
    expect(
      getByText(
        /AGI Cloud sets up the call, then your audio streams directly between this device and OpenAI/,
      ),
    ).toBeTruthy();
    expect(
      getByText(
        /Local Mode uses a device voice\. In AGI Cloud, text is sent through AGI Cloud to OpenAI/,
      ),
    ).toBeTruthy();
    expect(getByText(/app attempts to delete it when playback ends or stops/)).toBeTruthy();
    expect(queryByText('Read aloud, text scanning and translation')).toBeNull();
  });
});
