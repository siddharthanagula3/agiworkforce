/**
 * Regression: app/(app)/connectors/index.tsx (reachable via the
 * agiworkforce://connectors deep link and the drawer) previously rendered a
 * fake "AGI Cloud connectors... Enter invite code / Join waitlist" screen
 * when FEATURES.connectors is off — implying AGI Cloud itself is
 * invite-gated. That hasn't been true since public alpha opened (founder
 * decision, 2026-06-27): a signed-in Pro/Max user tapping "Enter invite
 * code" here would hit a dead end, since they already have cloud access —
 * the real reason connectors aren't showing is the feature flag, not their
 * account. Fixed to use the same honest FeatureUnavailable fallback already
 * used by Schedules/Companion, and the sibling
 * settings/cloud-connectors/index.tsx screen's already-fixed pattern.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useRouter: () => ({ canGoBack: () => false, back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native');
  const icon = () => <Text>icon</Text>;
  return { ArrowLeft: icon, Link2: icon, Sparkles: icon };
});

jest.mock('../src/features/integrations/store', () => ({
  useIntegrationStore: (
    selector: (s: {
      connectedConnectors: Record<string, boolean>;
      enabledConnectors: Record<string, boolean>;
      disconnectConnector: () => void;
      toggleConnector: () => void;
    }) => unknown,
  ) =>
    selector({
      connectedConnectors: {},
      enabledConnectors: {},
      disconnectConnector: jest.fn(),
      toggleConnector: jest.fn(),
    }),
}));

jest.mock('@/lib/v1FeatureFlags', () => ({ FEATURES: { connectors: false } }));

import ConnectorsScreen from '../app/(app)/connectors/index';

describe('Connectors screen — unshipped-feature gating (public alpha)', () => {
  it('shows the honest FeatureUnavailable fallback, not a fake invite/waitlist gate, when FEATURES.connectors is false', () => {
    const { getByText, queryByText, queryByLabelText } = render(<ConnectorsScreen />);

    expect(getByText('Connectors isn’t available yet')).toBeTruthy();
    // The old misleading copy implying AGI Cloud itself needs an invite code.
    expect(queryByText('AGI Cloud connectors')).toBeNull();
    expect(queryByLabelText('Enter invite code')).toBeNull();
    expect(queryByLabelText('Join waitlist')).toBeNull();
  });
});
