import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('@/src/features/auth/store', () => {
  const { create } = jest.requireActual<ImportedModule0>('zustand');
  return {
    useAuthStore: create(() => ({
      isClerkLoaded: true,
      isClerkSignedIn: false,
      clerkUserId: null,
    })),
  };
});

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
  useWaitlistStore: Object.assign(
    (selector: (state: { cloudUnlocked: boolean }) => unknown) =>
      selector({ cloudUnlocked: false }),
    { getState: () => ({ cloudUnlocked: false }), subscribe: () => () => {} },
  ),
}));

jest.mock('../lib/safeOpenURL', () => ({
  openExternalUrl: jest.fn(),
}));

import { useAuthStore } from '../src/features/auth/store';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import DataControlsScreen from '../src/features/settings/data-controls';
import CloudPrivacyScreen from '../src/features/settings/cloud-privacy';
import DataUseScreen from '../src/features/settings/cloud-privacy/DataUseScreen';

describe('model-training privacy policy', () => {
  beforeEach(() => {
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: 'user_test' });
    useChatAppModeStore.setState({ appMode: 'cloud' });
  });

  const policyLead =
    'AGI doesn’t train its own models on your chats; Free-plan providers may unless you opt out';

  it('states the AGI-owned policy and the free-model caveat in Data Controls', () => {
    const { getByText, queryByRole } = render(<DataControlsScreen />);

    expect(getByText('Model training')).toBeTruthy();
    expect(getByText(`${policyLead} in Privacy settings.`)).toBeTruthy();
    expect(queryByRole('switch', { name: /model training/i })).toBeNull();
  });

  it('removes the ambiguous consent promise from Cloud Privacy', () => {
    const { getAllByText, getByText, queryByText } = render(<CloudPrivacyScreen />);

    expect(getAllByText('Model training')).toHaveLength(2);
    expect(getByText(`${policyLead} in AGI Cloud.`)).toBeTruthy();
    expect(getByText('Only use models that do not train on your chats')).toBeTruthy();
    expect(queryByText(/without explicit consent/i)).toBeNull();
  });

  it('states chat retention with the legal-hold exception the purge applies', () => {
    const { getByText, queryByText } = render(<CloudPrivacyScreen />);

    expect(
      getByText(
        'Deleted and temporary chats are normally deleted for good after 30 days. A workspace legal hold can keep them longer.',
      ),
    ).toBeTruthy();
    expect(
      queryByText('Deleted and temporary chats are erased for good after 30 days.'),
    ).toBeNull();
  });

  it('lists the Siri and calendar paths that send data to AGI Cloud', () => {
    const { getByText } = render(<DataUseScreen />);

    expect(getByText('Ask from Siri')).toBeTruthy();
    expect(
      getByText(
        'Siri passes your question to AGI Cloud, then the AI provider of the model that answers. The answer is saved as a chat.',
      ),
    ).toBeTruthy();
    expect(getByText('Calendar in AGI Cloud chats')).toBeTruthy();
    expect(
      getByText(
        'When a chat reads your calendar, the events it reads, with their titles, times, places and notes, go to AGI Cloud and the model provider.',
      ),
    ).toBeTruthy();
  });
});

type ImportedModule0 = typeof import('zustand');
