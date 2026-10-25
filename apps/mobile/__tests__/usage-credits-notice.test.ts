/* eslint-disable @typescript-eslint/no-require-imports */
import { act, renderHook } from '@testing-library/react-native';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (cb: () => void) => {
    const React = require('react');
    React.useEffect(() => cb(), [cb]);
  },
}));

jest.mock('../services/usage', () => ({
  fetchUsageSnapshot: jest.fn().mockResolvedValue(null),
}));

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
}));

import {
  USAGE_CREDITS_NOTICE,
  USAGE_CREDITS_NOTICE_ROUTE,
  isUsageCreditsNotice,
  surfaceUsageCreditsNotice,
  useUsageCreditsNoticeStore,
} from '../src/features/chat/utils/usageCreditsNotice';
import { useWorkUsageLimit } from '../src/features/chat/hooks/useWorkUsageLimit';

function headers(quotaWarning: string | null): { get(name: string): string | null } {
  return {
    get: (name: string) => (name.toLowerCase() === 'x-quota-warning' ? quotaWarning : null),
  };
}

describe('the usage credits notice on mobile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useUsageCreditsNoticeStore.setState({ shown: false, told: false });
  });

  it('reads the scope the server sends when a turn is billed to credits', () => {
    expect(isUsageCreditsNotice('level=info; scope=usage_credits')).toBe(true);
    expect(isUsageCreditsNotice('level=warning; scope=rolling_weekly; used_percent=85')).toBe(
      false,
    );
    expect(isUsageCreditsNotice(null)).toBe(false);
  });

  it('shows the notice in the usage banner once per app session and opens usage', () => {
    const { result } = renderHook(() => useWorkUsageLimit({ metered: true }));
    expect(result.current.creditsNotice).toBeNull();

    act(() => surfaceUsageCreditsNotice(headers('level=info; scope=usage_credits')));
    expect(result.current.creditsNotice?.message).toBe(USAGE_CREDITS_NOTICE);
    expect(result.current.creditsNotice?.actionLabel).toBe('View usage');

    act(() => result.current.creditsNotice?.onAction());
    expect(mockPush).toHaveBeenCalledWith(USAGE_CREDITS_NOTICE_ROUTE);
    expect(result.current.creditsNotice).toBeNull();

    act(() => surfaceUsageCreditsNotice(headers('level=info; scope=usage_credits')));
    expect(result.current.creditsNotice).toBeNull();
  });

  it('ignores a plain quota warning and stays hidden off the metered route', () => {
    act(() => surfaceUsageCreditsNotice(headers('level=warning; scope=billing_period')));
    expect(useUsageCreditsNoticeStore.getState().shown).toBe(false);

    act(() => surfaceUsageCreditsNotice(headers('level=info; scope=usage_credits')));
    const { result } = renderHook(() => useWorkUsageLimit({ metered: false }));
    expect(result.current.creditsNotice).toBeNull();
  });
});
