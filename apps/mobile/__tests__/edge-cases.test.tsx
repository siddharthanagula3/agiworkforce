jest.mock('@/src/ui/theme', () => ({
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    '2xl': 24,
    '3xl': 32,
    '4xl': 40,
  },
  radii: {
    sm: 6,
    md: 8,
    lg: 12,
    xl: 16,
    '2xl': 24,
    '3xl': 32,
    full: 9999,
  },
  useThemeColors: () => ({
    textPrimary: '#e8e4db',
    textSecondary: 'rgba(232,228,219,0.75)',
    textMuted: 'rgba(232,228,219,0.5)',
    teal: '#21808d',
    border: 'rgba(255,235,205,0.08)',
    agentWarning: '#f59e0b',
    agentError: '#ef4444',
    agentSuccess: '#10b981',
    surfaceElevated: '#242220',
    surfaceHover: '#363330',
    white: '#ffffff',
    background: '#1a1915',
  }),
}));

jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOnline: false, isReconnecting: false, queueSize: 0 }),
}));

import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { EDGE_COPY } from '@/src/features/edge-cases/components/copy';
import { OfflineBanner } from '@/src/features/edge-cases/components/OfflineBanner';

const SAFE_AREA: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function withSafeArea(node: React.ReactElement): React.ReactElement {
  return <SafeAreaProvider initialMetrics={SAFE_AREA}>{node}</SafeAreaProvider>;
}

describe('OfflineBanner', () => {
  beforeEach(() => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the celebratory offline copy when offline', () => {
    const { getByText } = render(withSafeArea(<OfflineBanner />));
    expect(getByText(EDGE_COPY.offline.banner)).toBeTruthy();
  });
});
