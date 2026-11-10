/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockSearchParams: Record<string, string> = {};

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
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

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
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

jest.mock('react-native-webrtc', () => ({
  RTCPeerConnection: jest.fn(),
  RTCSessionDescription: jest.fn(),
  RTCIceCandidate: jest.fn(),
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    navigate: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

jest.mock('react-native-safe-area-context', () => {
  const RN = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <RN.View>{children}</RN.View>,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : icon) });
});

jest.mock('expo-camera', () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: false }, jest.fn()],
}));

jest.mock('@/services/companion', () => ({
  manualReconnect: jest.fn(),
  isValidPairingCode: jest.fn(() => true),
}));

jest.mock('@/src/features/companion/remote-code/service', () => ({
  listCodeSessions: jest.fn(),
  startCodeSession: jest.fn(),
}));

jest.mock('../src/features/voice/components/VoiceInputButton', () => ({
  VoiceInputButton: () => null,
}));

jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(async () => null),
  getAuthHeaders: jest.fn(async () => ({})),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
  getCurrentUser: jest.fn(async () => null),
  getCurrentUserId: jest.fn(async () => null),
}));

jest.mock('../src/features/schedules/components/ScheduleForm', () => ({
  ScheduleForm: () => null,
}));

import { MODEL_LIST as CLOUD_MODEL_LIST } from '@/lib/models';
import { NATIVE_PURCHASES_AVAILABLE } from '@/src/features/billing/nativePurchaseAvailability';
import { useTierStore } from '@/src/features/billing/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { useScheduleStore } from '@/src/features/schedules/store';
import { useConnectionStore } from '@/stores/connectionStore';
import {
  CLOUD_LOCK_REASON,
  getModelByIdForCloudAccess,
  getModelListForCloudAccess,
} from '@/src/features/model-picker/service';
import { resolveMobileImageGenerationRequest } from '@/src/features/chat/actions/resolveMobileImageGenerationRequest';
import RemoteControlSettingsScreen from '../app/(app)/settings/remote-control';
import SchedulesScreen from '../app/(app)/schedules';
import CreateScheduleScreen from '../app/(app)/schedules/create';
import { FeatureUnavailable } from '@/src/shared/components/FeatureUnavailable';

const BILLING = '/(app)/settings/cloud-billing';
const PLANS = '/(app)/settings/plans';

function pushedPurchasePath(): boolean {
  return mockPush.mock.calls.some(([route]) => route === BILLING || route === PLANS);
}

beforeEach(() => {
  jest.clearAllMocks();
  useChatAppModeStore.setState({ appMode: 'cloud' });
  useWaitlistStore.setState({ cloudUnlocked: true });
  useTierStore.setState({ tier: 'free', lastRefreshedAt: '2026-10-22T00:00:00.000Z' });
  useScheduleStore.setState({
    schedules: [],
    runs: {},
    loading: false,
    error: null,
    fetchSchedules: jest.fn(async () => undefined),
  });
  useConnectionStore.setState({
    status: 'disconnected',
    desktopName: null,
    pairingCode: null,
    lastHeartbeatAt: null,
  });
});

describe('the build switch', () => {
  it('is off, so the selling paths below are not compiled in', () => {
    expect(NATIVE_PURCHASES_AVAILABLE).toBe(false);
  });
});

describe('model picker without purchases', () => {
  const planLockedModelId = CLOUD_MODEL_LIST.find(
    (model) => getModelByIdForCloudAccess(model.id, true, 'free')?.availability === 'locked',
  )?.id;

  it('has a model that is locked by plan on Free, so the filter below has something to remove', () => {
    expect(planLockedModelId).toBeDefined();
  });

  it('words a plan-locked model neutrally', () => {
    const model = getModelByIdForCloudAccess(planLockedModelId!, true, 'free');
    expect(model?.lockReason).toBe("This model isn't included in your plan.");
    expect(model?.detailLabel).not.toMatch(/upgrade/i);
  });

  it('does not list plan-locked models for a signed-in Free account', () => {
    const list = getModelListForCloudAccess(true, 'free', null);

    expect(list.some((model) => model.id === planLockedModelId)).toBe(false);
    expect(list.filter((model) => model.availability === 'locked')).toEqual([]);
    for (const model of list) {
      expect(model.lockReason ?? '').not.toMatch(/upgrade/i);
      expect(model.detailLabel).not.toMatch(/upgrade/i);
    }
  });

  it('keeps the sign-in row for a signed-out user', () => {
    const list = getModelListForCloudAccess(false, undefined, null);
    const locked = list.filter((model) => model.availability === 'locked');

    expect(locked.length).toBeGreaterThan(0);
    for (const model of locked) {
      expect(model.lockReason).toBe(CLOUD_LOCK_REASON);
      expect(model.detailLabel).toBe('Sign in required');
    }
  });
});

describe('schedules without purchases', () => {
  it('shows a neutral locked state on the list with no plans button or billing push', () => {
    const { getAllByText, queryByText, queryByLabelText, queryAllByText } = render(
      <SchedulesScreen />,
    );

    expect(getAllByText("Scheduled tasks aren't included in your plan").length).toBeGreaterThan(0);
    expect(queryByText('View Plans')).toBeNull();
    expect(queryByLabelText('View plans for scheduled tasks')).toBeNull();
    expect(queryAllByText(/upgrade/i)).toEqual([]);
    expect(queryAllByText(/require Basic/i)).toEqual([]);
    expect(pushedPurchasePath()).toBe(false);
  });

  it('shows a neutral locked state on the create screen with no plans button or billing push', () => {
    const { getByText, queryByText, queryByLabelText, queryAllByText } = render(
      <CreateScheduleScreen />,
    );

    expect(getByText("Scheduled tasks aren't included in your plan")).toBeTruthy();
    expect(queryByText('View Plans')).toBeNull();
    expect(queryByLabelText('View plans for scheduled tasks')).toBeNull();
    expect(queryAllByText(/upgrade/i)).toEqual([]);
    expect(pushedPurchasePath()).toBe(false);
  });
});

describe('Remote Control without purchases', () => {
  it('states that it is not included and offers no plans row or pairing', () => {
    const { getByText, queryByLabelText, queryByText } = render(<RemoteControlSettingsScreen />);

    expect(getByText("Remote Control isn't included in your plan.")).toBeTruthy();
    expect(queryByLabelText('See plans')).toBeNull();
    expect(queryByText('See plans')).toBeNull();
    expect(queryByLabelText('Pair a computer')).toBeNull();
    expect(pushedPurchasePath()).toBe(false);
  });

  it('still pairs for an account whose plan includes it', () => {
    useTierStore.setState({ tier: 'basic', lastRefreshedAt: '2026-10-22T00:00:00.000Z' });
    const { getByLabelText, queryByText } = render(<RemoteControlSettingsScreen />);

    expect(queryByText("Remote Control isn't included in your plan.")).toBeNull();
    fireEvent.press(getByLabelText('Pair a computer'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/companion');
  });
});

describe('image generation without purchases', () => {
  const freeRequest = {
    executionMode: 'cloud' as const,
    text: '/image a lighthouse at dusk',
    mediaMode: 'text' as const,
    selection: 'auto',
    subscriptionTier: 'free',
    attachments: [],
    globalImageGenerationEnabled: true,
    imageGenerationEnabled: true,
    isClerkSignedIn: true,
    ownerId: 'no-purchases-image-user',
    grantedCapabilities: [] as string[],
    isOnline: true,
  };

  it('refuses a Free account without naming an upgrade', () => {
    const result = resolveMobileImageGenerationRequest(freeRequest);

    expect(result).toMatchObject({ status: 'blocked', code: 'plan_required' });
    if (result.status !== 'blocked') throw new Error('expected a blocked request');
    expect(result.alert.message).toBe("It isn't included in your plan.");
    expect(`${result.alert.title} ${result.alert.message}`).not.toMatch(/upgrade/i);
  });
});

describe('feature unavailable without purchases', () => {
  it('describes an entitlement block without pointing at a higher plan', () => {
    const { getByText, queryByText } = render(
      <FeatureUnavailable feature="Workspaces" reason="entitlement" />,
    );

    expect(getByText(/isn’t included in your plan/)).toBeTruthy();
    expect(queryByText(/higher plan/)).toBeNull();
  });
});
