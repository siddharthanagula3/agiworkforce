/**
 * Edge-case modals — unit tests.
 *
 * Each test verifies:
 *   1. The component renders the locked copy strings.
 *   2. The primary CTA callback fires when pressed.
 *
 * All theme and native deps are mocked.
 */

// ---------------------------------------------------------------------------
// Mocks — MUST be before any imports (Jest hoisting)
// ---------------------------------------------------------------------------

jest.mock('@/hooks/useTheme', () => ({
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

// AccessibilityInfo spy is set up per-suite via beforeEach (see OfflineBanner section)

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';

import { EDGE_COPY } from '@/src/features/edge-cases/components/copy';
import { OfflineBanner } from '@/src/features/edge-cases/components/OfflineBanner';
import { ModelLoadingFirstRunModal } from '@/src/features/edge-cases/components/ModelLoadingFirstRunModal';
import { StorageFullModal } from '@/src/features/edge-cases/components/StorageFullModal';
import { ThermalThrottleModal } from '@/src/features/edge-cases/components/ThermalThrottleModal';
import { BatteryLowModal } from '@/src/features/edge-cases/components/BatteryLowModal';
import { ImageTooLargeModal } from '@/src/features/edge-cases/components/ImageTooLargeModal';
import { FileTooLargeModal } from '@/src/features/edge-cases/components/FileTooLargeModal';
import { FileUnreadableModal } from '@/src/features/edge-cases/components/FileUnreadableModal';
import { CloudTeaseModal } from '@/src/features/edge-cases/components/CloudTeaseModal';

// ---------------------------------------------------------------------------
// 4. OfflineBanner
// ---------------------------------------------------------------------------

describe('OfflineBanner', () => {
  beforeEach(() => {
    // Spy on AccessibilityInfo to avoid native module crash in Jest
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the celebratory offline copy when offline', () => {
    const { getByText } = render(<OfflineBanner />);
    // copy contains em-dashes; match partial text that is stable
    expect(getByText(EDGE_COPY.offline.banner)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 8. ModelLoadingFirstRunModal
// ---------------------------------------------------------------------------

describe('ModelLoadingFirstRunModal', () => {
  it('renders title and subtitle copy', () => {
    const { getByText } = render(
      <ModelLoadingFirstRunModal visible progress={0.4} etaSeconds={30} />,
    );
    expect(getByText(EDGE_COPY.modelLoadingFirstRun.title)).toBeTruthy();
    expect(getByText(EDGE_COPY.modelLoadingFirstRun.subtitle)).toBeTruthy();
  });

  it('renders ETA string when etaSeconds is provided', () => {
    const { getByText } = render(
      <ModelLoadingFirstRunModal visible progress={0.2} etaSeconds={45} />,
    );
    // ETA format: "About 45s remaining"
    expect(getByText(/About 45s remaining/)).toBeTruthy();
  });

  it('shows percent text', () => {
    const { getByText } = render(<ModelLoadingFirstRunModal visible progress={0.75} />);
    expect(getByText('75%')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 6. StorageFullModal
// ---------------------------------------------------------------------------

describe('StorageFullModal', () => {
  it('renders title and body copy', () => {
    const onCancel = jest.fn();
    const { getByText } = render(<StorageFullModal visible onCancel={onCancel} />);
    expect(getByText(EDGE_COPY.storageFull.title)).toBeTruthy();
    expect(getByText(EDGE_COPY.storageFull.body)).toBeTruthy();
  });

  it('calls onCancel when Cancel is pressed', () => {
    const onCancel = jest.fn();
    const { getByText } = render(<StorageFullModal visible onCancel={onCancel} />);
    fireEvent.press(getByText(EDGE_COPY.storageFull.cancel));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders the settings CTA', () => {
    const { getByText } = render(<StorageFullModal visible onCancel={jest.fn()} />);
    expect(getByText(EDGE_COPY.storageFull.openSettings)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 7. ThermalThrottleModal
// ---------------------------------------------------------------------------

describe('ThermalThrottleModal', () => {
  it('renders title and body copy', () => {
    const onDismiss = jest.fn();
    const { getByText } = render(<ThermalThrottleModal visible onDismiss={onDismiss} />);
    expect(getByText(EDGE_COPY.thermalThrottle.title)).toBeTruthy();
    expect(getByText(EDGE_COPY.thermalThrottle.body)).toBeTruthy();
  });

  it('calls onDismiss when Got it is pressed', () => {
    const onDismiss = jest.fn();
    const { getByText } = render(<ThermalThrottleModal visible onDismiss={onDismiss} />);
    fireEvent.press(getByText(EDGE_COPY.thermalThrottle.cta));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 5. BatteryLowModal
// ---------------------------------------------------------------------------

describe('BatteryLowModal', () => {
  it('renders title and body copy', () => {
    const { getByText } = render(
      <BatteryLowModal visible onConfirm={jest.fn()} onCancel={jest.fn()} />,
    );
    expect(getByText(EDGE_COPY.batteryLow.title)).toBeTruthy();
    expect(getByText(EDGE_COPY.batteryLow.body)).toBeTruthy();
  });

  it('calls onConfirm when "Yes, continue" is pressed', () => {
    const onConfirm = jest.fn();
    const { getByText } = render(
      <BatteryLowModal visible onConfirm={onConfirm} onCancel={jest.fn()} />,
    );
    fireEvent.press(getByText(EDGE_COPY.batteryLow.confirm));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when Cancel is pressed', () => {
    const onCancel = jest.fn();
    const { getByText } = render(
      <BatteryLowModal visible onConfirm={jest.fn()} onCancel={onCancel} />,
    );
    fireEvent.press(getByText(EDGE_COPY.batteryLow.cancel));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 3. ImageTooLargeModal
// ---------------------------------------------------------------------------

describe('ImageTooLargeModal', () => {
  it('renders title and body copy', () => {
    const { getByText } = render(<ImageTooLargeModal visible onDismiss={jest.fn()} />);
    expect(getByText(EDGE_COPY.imageTooLarge.title)).toBeTruthy();
    expect(getByText(EDGE_COPY.imageTooLarge.body)).toBeTruthy();
  });

  it('calls onDismiss when Got it is pressed', () => {
    const onDismiss = jest.fn();
    const { getByText } = render(<ImageTooLargeModal visible onDismiss={onDismiss} />);
    fireEvent.press(getByText(EDGE_COPY.imageTooLarge.cta));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 1. FileTooLargeModal
// ---------------------------------------------------------------------------

describe('FileTooLargeModal', () => {
  it('renders title and body copy', () => {
    const { getByText } = render(<FileTooLargeModal visible onDismiss={jest.fn()} />);
    expect(getByText(EDGE_COPY.fileTooLarge.title)).toBeTruthy();
    expect(getByText(EDGE_COPY.fileTooLarge.body)).toBeTruthy();
  });

  it('calls onDismiss when Got it is pressed', () => {
    const onDismiss = jest.fn();
    const { getByText } = render(<FileTooLargeModal visible onDismiss={onDismiss} />);
    fireEvent.press(getByText(EDGE_COPY.fileTooLarge.cta));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 2. FileUnreadableModal
// ---------------------------------------------------------------------------

describe('FileUnreadableModal', () => {
  it('renders title and body copy', () => {
    const { getByText } = render(<FileUnreadableModal visible onDismiss={jest.fn()} />);
    expect(getByText(EDGE_COPY.fileUnreadable.title)).toBeTruthy();
    expect(getByText(EDGE_COPY.fileUnreadable.body)).toBeTruthy();
  });

  it('calls onDismiss when Got it is pressed', () => {
    const onDismiss = jest.fn();
    const { getByText } = render(<FileUnreadableModal visible onDismiss={onDismiss} />);
    fireEvent.press(getByText(EDGE_COPY.fileUnreadable.cta));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// 10. CloudTeaseModal
// ---------------------------------------------------------------------------

describe('CloudTeaseModal', () => {
  it('renders title copy', () => {
    const { getByText } = render(<CloudTeaseModal visible rank={42} onDismiss={jest.fn()} />);
    expect(getByText(EDGE_COPY.cloudTease.title)).toBeTruthy();
  });

  it('renders rank number in body text', () => {
    const { getByTestId } = render(<CloudTeaseModal visible rank={42} onDismiss={jest.fn()} />);
    const rankEl = getByTestId('cloud-tease-rank');
    const text = rankEl.children.join('');
    expect(text).toContain("You're #42");
  });

  it('renders correct rank with comma-formatting for large numbers', () => {
    const { getByTestId } = render(<CloudTeaseModal visible rank={1247} onDismiss={jest.fn()} />);
    const text = getByTestId('cloud-tease-rank').children.join('');
    expect(text).toContain('1,247');
  });

  it('calls onDismiss when Got it is pressed', () => {
    const onDismiss = jest.fn();
    const { getByText } = render(<CloudTeaseModal visible rank={1} onDismiss={onDismiss} />);
    fireEvent.press(getByText(EDGE_COPY.cloudTease.cta));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
