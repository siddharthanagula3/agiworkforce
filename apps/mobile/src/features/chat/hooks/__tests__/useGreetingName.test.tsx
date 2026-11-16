import { act, renderHook } from '@testing-library/react-native';

let mockClerkUser: { firstName?: string | null; fullName?: string | null } | null = null;

jest.mock('@clerk/expo', () => ({
  useUser: () => ({ user: mockClerkUser }),
}));

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import { useGreetingName } from '../useGreetingName';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '@/stores/settings/cloudSettingsStore';

function seed(
  store: typeof useLocalSettingsStore | typeof useCloudSettingsStore,
  partial: Record<string, unknown>,
): void {
  const setState = store.setState as (next: unknown) => void;
  act(() => {
    setState({
      personalization: {
        ...store.getState().personalization,
        fullName: '',
        nickname: '',
        nameOptedOut: false,
        ...partial,
      },
    });
  });
}

describe('useGreetingName', () => {
  beforeEach(() => {
    mockClerkUser = null;
    act(() => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
    });
    seed(useLocalSettingsStore, {});
    seed(useCloudSettingsStore, {});
  });

  describe('in Cloud', () => {
    it('prefers the nickname', () => {
      seed(useCloudSettingsStore, { nickname: 'Ada', fullName: 'Augusta Ada King' });
      mockClerkUser = { firstName: 'Linus' };
      expect(renderHook(() => useGreetingName()).result.current).toBe('Ada');
    });

    it('takes the first word of the full name without a nickname', () => {
      seed(useCloudSettingsStore, { fullName: 'Grace Brewster Hopper' });
      mockClerkUser = { firstName: 'Linus' };
      expect(renderHook(() => useGreetingName()).result.current).toBe('Grace');
    });

    it('falls back to the Clerk first name, then to the first word of the Clerk full name', () => {
      mockClerkUser = { firstName: 'Linus', fullName: 'Linus Torvalds' };
      expect(renderHook(() => useGreetingName()).result.current).toBe('Linus');

      mockClerkUser = { firstName: null, fullName: 'Margaret Hamilton' };
      expect(renderHook(() => useGreetingName()).result.current).toBe('Margaret');
    });

    it('is empty with no name anywhere', () => {
      expect(renderHook(() => useGreetingName()).result.current).toBe('');
    });

    it('is empty when the person opted out, whatever is stored', () => {
      seed(useCloudSettingsStore, { nickname: 'Ada', nameOptedOut: true });
      mockClerkUser = { firstName: 'Linus' };
      expect(renderHook(() => useGreetingName()).result.current).toBe('');
    });

    it('ignores the Local name and the Local opt-out', () => {
      seed(useLocalSettingsStore, { nickname: 'Bo', nameOptedOut: true });
      seed(useCloudSettingsStore, { nickname: 'Ada' });
      expect(renderHook(() => useGreetingName()).result.current).toBe('Ada');
    });
  });

  describe('in Local', () => {
    beforeEach(() => {
      act(() => {
        useChatAppModeStore.setState({ appMode: 'local' });
      });
    });

    it('uses the Local nickname or the first word of the Local full name', () => {
      seed(useLocalSettingsStore, { nickname: 'Bo', fullName: 'Barbara Liskov' });
      expect(renderHook(() => useGreetingName()).result.current).toBe('Bo');

      seed(useLocalSettingsStore, { nickname: '', fullName: 'Barbara Liskov' });
      expect(renderHook(() => useGreetingName()).result.current).toBe('Barbara');
    });

    it('never uses the Clerk name', () => {
      mockClerkUser = { firstName: 'Linus', fullName: 'Linus Torvalds' };
      expect(renderHook(() => useGreetingName()).result.current).toBe('');
    });

    it('never uses the Cloud name', () => {
      seed(useCloudSettingsStore, { nickname: 'Ada' });
      expect(renderHook(() => useGreetingName()).result.current).toBe('');
    });

    it('is empty when the person opted out of the Local name', () => {
      seed(useLocalSettingsStore, { nickname: 'Bo', nameOptedOut: true });
      expect(renderHook(() => useGreetingName()).result.current).toBe('');
    });
  });
});
