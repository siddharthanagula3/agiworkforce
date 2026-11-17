import { act, renderHook, waitFor } from '@testing-library/react-native';

interface MockClerkUser {
  id?: string;
  firstName?: string | null;
  fullName?: string | null;
  username?: string | null;
  primaryEmailAddress?: { emailAddress: string } | null;
}

let mockClerkUser: MockClerkUser | null = null;
const mockApiGet = jest.fn();

jest.mock('@/services/api', () => ({
  api: { get: (...args: unknown[]) => mockApiGet(...args) },
}));

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
import { useAuthStore } from '@/src/features/auth/store';
import { useCloudProfileStore } from '@/src/features/settings/cloud-account/cloudProfileStore';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';

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

function meResponse(ownerId: string, displayName: string) {
  return {
    id: ownerId,
    email: null,
    name: displayName,
    profile: { display_name: displayName, preferred_name: null, work_description: null },
    avatar_url: null,
    created_at: null,
    updated_at: 1,
    plan: { tier: 'free', display_name: 'Free', status: 'active', current_period_end: null },
    feature_flags: { advanced_model_access: false },
    routing_preferences: {},
  };
}

function seedProfile(ownerId: string, displayName: string): void {
  act(() => {
    useCloudProfileStore.setState({ ownerId, displayName, loaded: true, loading: false });
  });
}

describe('useGreetingName', () => {
  beforeEach(() => {
    mockClerkUser = null;
    mockApiGet.mockReset();
    __resetCloudAccountSessionForTests();
    act(() => {
      useCloudProfileStore.getState().reset();
      useAuthStore.setState({ isClerkSignedIn: true, clerkUserId: 'user_a' });
    });
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

  describe('from the AGI profile name', () => {
    beforeEach(() => {
      mockClerkUser = { id: 'user_a', firstName: null, fullName: null };
    });

    it('takes the first word of the profile name when nothing else names the person', () => {
      seedProfile('user_a', 'Test Free (free)');
      expect(renderHook(() => useGreetingName()).result.current).toBe('Test');
    });

    it('loads the profile for the signed-in account and greets once it arrives', async () => {
      activateCloudAccount('user_a');
      mockApiGet.mockResolvedValue(meResponse('user_a', 'Test Free (free)'));
      const { result } = renderHook(() => useGreetingName());
      expect(result.current).toBe('');
      await waitFor(() => expect(result.current).toBe('Test'));
      expect(mockApiGet).toHaveBeenCalledTimes(1);
    });

    it('loads the profile once for two screens that greet', async () => {
      activateCloudAccount('user_a');
      mockApiGet.mockResolvedValue(meResponse('user_a', 'Ada Lovelace'));
      const first = renderHook(() => useGreetingName());
      const second = renderHook(() => useGreetingName());
      await waitFor(() => expect(first.result.current).toBe('Ada'));
      expect(second.result.current).toBe('Ada');
      expect(mockApiGet).toHaveBeenCalledTimes(1);
    });

    it('waits for the account to be activated, then loads the profile without a remount', async () => {
      mockApiGet.mockResolvedValue(meResponse('user_a', 'Ada Lovelace'));
      const { result } = renderHook(() => useGreetingName());
      expect(mockApiGet).not.toHaveBeenCalled();
      act(() => {
        activateCloudAccount('user_a');
      });
      await waitFor(() => expect(result.current).toBe('Ada'));
      expect(mockApiGet).toHaveBeenCalledTimes(1);
    });

    it('loads the profile of the new account when the sign-in user changes', async () => {
      activateCloudAccount('user_a');
      seedProfile('user_a', 'Grace Hopper');
      const { result, rerender } = renderHook(() => useGreetingName());
      expect(result.current).toBe('Grace');

      mockClerkUser = { id: 'user_b', firstName: null, fullName: null };
      act(() => {
        useAuthStore.setState({ isClerkSignedIn: true, clerkUserId: 'user_b' });
      });
      rerender({});
      expect(result.current).toBe('');
      expect(mockApiGet).not.toHaveBeenCalled();

      mockApiGet.mockResolvedValue(meResponse('user_b', 'Linus Torvalds'));
      act(() => {
        activateCloudAccount('user_b');
      });
      await waitFor(() => expect(result.current).toBe('Linus'));
      expect(mockApiGet).toHaveBeenCalledTimes(1);
    });

    it('treats blank personalization names as unset', () => {
      seedProfile('user_a', 'Test Free');
      seed(useCloudSettingsStore, { nickname: '   ', fullName: '  ' });
      expect(renderHook(() => useGreetingName()).result.current).toBe('Test');
    });

    it.each(['User', 'user'])('leaves the placeholder name %s out of the greeting', (name) => {
      seedProfile('user_a', name);
      expect(renderHook(() => useGreetingName()).result.current).toBe('');
    });

    it('keeps hyphens, apostrophes and accents in the name', () => {
      seedProfile('user_a', 'Marie-Hélène Côté');
      expect(renderHook(() => useGreetingName()).result.current).toBe('Marie-Hélène');
      seedProfile('user_a', "D'Angelo Russell");
      expect(renderHook(() => useGreetingName()).result.current).toBe("D'Angelo");
    });

    it.each([
      ['an email address', 'jane.doe@example.com'],
      ['a word in parentheses', '(free) Test'],
      ['a handle', '@janedoe'],
      ['a name with digits', 'user1234'],
      ['an email local part', 'agi-dev-free+clerk_test'],
      ['a symbol', '*** Test'],
      ['nothing', '   '],
    ])('leaves %s out of the greeting', (_label, displayName) => {
      seedProfile('user_a', displayName);
      expect(renderHook(() => useGreetingName()).result.current).toBe('');
    });

    it('never greets by the part of the email address before the at sign', () => {
      mockClerkUser = {
        id: 'user_a',
        primaryEmailAddress: { emailAddress: 'janedoe@example.com' },
        username: 'jd_handle',
      };
      seedProfile('user_a', 'janedoe');
      expect(renderHook(() => useGreetingName()).result.current).toBe('');
      seedProfile('user_a', 'JD_HANDLE');
      expect(renderHook(() => useGreetingName()).result.current).toBe('');
    });

    it('lets a personalization name win over the sign-in name, and the sign-in name win over the profile name', () => {
      seedProfile('user_a', 'Grace Hopper');
      seed(useCloudSettingsStore, { nickname: 'Ada' });
      mockClerkUser = { id: 'user_a', firstName: 'Linus' };
      expect(renderHook(() => useGreetingName()).result.current).toBe('Ada');

      seed(useCloudSettingsStore, {});
      expect(renderHook(() => useGreetingName()).result.current).toBe('Linus');

      mockClerkUser = { id: 'user_a', firstName: null };
      expect(renderHook(() => useGreetingName()).result.current).toBe('Grace');
    });

    it('does not ask the server for a profile name it will not use', () => {
      activateCloudAccount('user_a');
      mockClerkUser = { id: 'user_a', firstName: 'Linus' };
      renderHook(() => useGreetingName());
      seed(useCloudSettingsStore, { nickname: 'Ada' });
      mockClerkUser = { id: 'user_a', firstName: null };
      renderHook(() => useGreetingName());
      expect(mockApiGet).not.toHaveBeenCalled();
    });

    it('is empty when the person opted out', () => {
      seedProfile('user_a', 'Test Free');
      seed(useCloudSettingsStore, { nameOptedOut: true });
      expect(renderHook(() => useGreetingName()).result.current).toBe('');
    });

    it('is empty when signed out, and never loads a profile', () => {
      activateCloudAccount('user_a');
      act(() => {
        useAuthStore.setState({ isClerkSignedIn: false, clerkUserId: null });
      });
      mockClerkUser = null;
      expect(renderHook(() => useGreetingName()).result.current).toBe('');
      expect(mockApiGet).not.toHaveBeenCalled();
    });

    it('does not read the stored profile of another account', () => {
      seedProfile('user_b', 'Grace Hopper');
      expect(renderHook(() => useGreetingName()).result.current).toBe('');
    });

    it('clears the name when the account signs out', () => {
      seedProfile('user_a', 'Test Free');
      const { result, rerender } = renderHook(() => useGreetingName());
      expect(result.current).toBe('Test');

      mockClerkUser = null;
      act(() => {
        useAuthStore.setState({ isClerkSignedIn: false, clerkUserId: null });
        useCloudProfileStore.getState().reset();
      });
      rerender({});
      expect(result.current).toBe('');
    });

    it('is empty in Local, whatever the profile holds', () => {
      act(() => {
        useChatAppModeStore.setState({ appMode: 'local' });
      });
      activateCloudAccount('user_a');
      seedProfile('user_a', 'Test Free');
      expect(renderHook(() => useGreetingName()).result.current).toBe('');
      expect(mockApiGet).not.toHaveBeenCalled();
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
