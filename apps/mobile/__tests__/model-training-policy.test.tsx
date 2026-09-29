import React from 'react';
import { render } from '@testing-library/react-native';

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

describe('model-training privacy policy', () => {
  const policyLead =
    'AGI does not use your prompts, responses or files to train AGI-owned models. On the Free plan, requests are served by providers’ free models, and those providers’ terms may allow them to train on what you send, unless you turn on Only use models that do not train on your chats';

  it('states the AGI-owned policy and the free-model caveat in Data Controls', () => {
    const { getByText, queryByRole } = render(<DataControlsScreen />);

    expect(getByText('Model training')).toBeTruthy();
    expect(getByText(`${policyLead} in Privacy settings.`)).toBeTruthy();
    expect(queryByRole('switch', { name: /model training/i })).toBeNull();
  });

  it('removes the ambiguous consent promise from Cloud Privacy', () => {
    const { getAllByText, getByText, queryByText } = render(<CloudPrivacyScreen />);

    expect(getAllByText('Model training')).toHaveLength(2);
    expect(getByText(`${policyLead} below.`)).toBeTruthy();
    expect(getByText('Only use models that do not train on your chats')).toBeTruthy();
    expect(queryByText(/without explicit consent/i)).toBeNull();
  });
});
