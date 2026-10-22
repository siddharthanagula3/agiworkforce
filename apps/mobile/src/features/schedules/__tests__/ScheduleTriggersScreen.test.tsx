import React from 'react';
import { Alert, Share } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockParams = { id: 'task-1', name: 'Morning brief' };
const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPatch = jest.fn();
const mockDelete = jest.fn();
const mockCopy = jest.fn(async () => true);
let mockCopyStatus: 'idle' | 'copied' | 'failed' = 'idle';

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    navigate: jest.fn(),
    canGoBack: jest.fn(() => true),
  }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@clerk/expo', () => ({ getClerkInstance: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock(
  'lucide-react-native',
  () => new Proxy({}, { get: () => jest.fn().mockReturnValue(null) }),
);
jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((callback: () => void) => callback()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: { getItem: jest.fn(() => null), setItem: jest.fn(), removeItem: jest.fn() },
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
}));
jest.mock('@/src/shared/hooks/useCopyAction', () => ({
  ...jest.requireActual('@/src/shared/hooks/useCopyAction'),
  useCopyAction: () => ({ status: mockCopyStatus, copy: mockCopy }),
}));
jest.mock('@/services/api', () => ({
  ApiHttpError: jest.requireActual('@/services/apiErrors').ApiHttpError,
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { ScheduleTriggersScreen } from '../ScheduleTriggersScreen';

const TRIGGER = {
  id: 'trig-1',
  userId: 'user-1',
  organizationId: null,
  taskId: 'task-1',
  name: 'New PRs',
  source: 'github',
  eventTypes: ['pull_request.opened'],
  sourceAccount: 'acme/app',
  conditions: [{ field: 'data.branch', operator: 'equals', value: 'main' }],
  debounceSeconds: 0,
  maxAttempts: 3,
  isEnabled: true,
  verificationStatus: 'verified',
  verifiedAt: null,
  watchExpiresAt: null,
  watchError: null,
  lastFiredAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

describe('schedule triggers on mobile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCopyStatus = 'idle';
    __resetCloudAccountSessionForTests();
    activateCloudAccount('user-1');
    useAuthStore.setState({ isClerkLoaded: true, isClerkSignedIn: true, clerkUserId: 'user-1' });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    mockGet.mockResolvedValue({ triggers: [TRIGGER] });
  });

  it('lists a trigger with its filter and turns it off', async () => {
    mockPatch.mockResolvedValue({});
    const { findByText, getByLabelText } = render(<ScheduleTriggersScreen />);
    expect(await findByText('Only when Branch is main')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith('/api/triggers?taskId=task-1', { signal: undefined });
    fireEvent(getByLabelText('Turned on'), 'valueChange', false);
    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith('/api/triggers/trig-1', { isEnabled: false }),
    );
  });

  it('adds a signed webhook trigger with a filter and shows its secret once', async () => {
    mockPost.mockResolvedValue({
      trigger: { ...TRIGGER, id: 'trig-2', source: 'connector', name: 'Webhook trigger' },
      verificationCode: null,
      signingSecret: 'whsec_123',
      webhookPath: '/api/webhooks/triggers/trig-2',
    });
    const { findByLabelText, getByText, getByLabelText, findByText } = render(
      <ScheduleTriggersScreen />,
    );
    fireEvent.press(await findByLabelText('Add trigger'));
    fireEvent.press(getByText('Anything else (signed webhook)'));
    fireEvent.press(getByText('Add condition'));
    fireEvent.press(getByLabelText('Field path'));
    fireEvent.changeText(getByLabelText('Field path'), 'data.kind');
    fireEvent.press(getByText('is'));
    fireEvent.changeText(getByLabelText('Value'), 'invoice');
    fireEvent.press(getByText('Save trigger'));

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockPost.mock.calls[0]).toEqual([
      '/api/triggers',
      {
        taskId: 'task-1',
        name: 'Webhook trigger',
        source: 'connector',
        eventTypes: ['*'],
        debounceSeconds: 0,
        conditions: [{ field: 'data.kind', operator: 'equals', value: 'invoice' }],
      },
    ]);
    fireEvent.press(await findByText('Copy signing secret'));
    expect(mockCopy).toHaveBeenCalledWith('whsec_123');
  });

  describe('the one-time secrets after a trigger is added', () => {
    async function renderCreatedSecrets() {
      mockPost.mockResolvedValue({
        trigger: { ...TRIGGER, id: 'trig-2', source: 'connector', name: 'Webhook trigger' },
        verificationCode: null,
        signingSecret: 'whsec_123',
        webhookPath: '/api/webhooks/triggers/trig-2',
      });
      const screen = render(<ScheduleTriggersScreen />);
      fireEvent.press(await screen.findByLabelText('Add trigger'));
      fireEvent.press(screen.getByText('Anything else (signed webhook)'));
      fireEvent.press(screen.getByText('Save trigger'));
      await screen.findByText('Trigger added');
      return screen;
    }

    it('says so when the clipboard refused the write', async () => {
      mockCopyStatus = 'failed';
      const { findAllByText, queryByText } = await renderCreatedSecrets();

      expect((await findAllByText('Could not copy')).length).toBe(2);
      expect(queryByText('Copy signing secret')).toBeNull();
    });

    it('confirms a copy that landed', async () => {
      mockCopyStatus = 'copied';
      const { findAllByText } = await renderCreatedSecrets();

      expect((await findAllByText('Copied')).length).toBe(2);
    });

    it('offers Share beside each copy, so a refused clipboard does not lose a secret shown once', async () => {
      const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
      const { getByLabelText } = await renderCreatedSecrets();

      fireEvent.press(getByLabelText('Share signing secret'));
      fireEvent.press(getByLabelText('Share webhook URL'));

      expect(share).toHaveBeenNthCalledWith(1, { message: 'whsec_123' });
      expect(share).toHaveBeenNthCalledWith(2, {
        message: expect.stringContaining('/api/webhooks/triggers/trig-2'),
      });
    });
  });

  it('refuses a condition with no value before calling the server', async () => {
    const { findByLabelText, getByText, findByText } = render(<ScheduleTriggersScreen />);
    fireEvent.press(await findByLabelText('Add trigger'));
    fireEvent.press(getByText('Add condition'));
    fireEvent.press(getByText('Save trigger'));
    expect(await findByText('Give every condition a value to compare against.')).toBeTruthy();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('deletes a trigger only after naming what stops', async () => {
    mockDelete.mockResolvedValue({ success: true });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, body, buttons) => {
      expect(body).toMatch(/Morning brief stops running/);
      buttons?.find((button) => button.style === 'destructive')?.onPress?.();
    });
    const { findByText } = render(<ScheduleTriggersScreen />);
    fireEvent.press(await findByText('Delete trigger'));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('/api/triggers/trig-1'));
    alert.mockRestore();
  });
});
