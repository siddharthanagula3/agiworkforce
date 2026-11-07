import { act, renderHook } from '@testing-library/react-native';
import { useLibraryPickerScope } from '../useLibraryPickerScope';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
  invalidateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';

describe('Library picker ownership', () => {
  beforeEach(() => {
    __resetCloudAccountSessionForTests();
    activateCloudAccount('owner-a');
    useChatAppModeStore.setState({ appMode: 'cloud' });
  });

  it('revokes old destination callbacks even after returning to the original destination', () => {
    const { result, rerender } = renderHook(
      ({ destination }) => useLibraryPickerScope(destination),
      { initialProps: { destination: 'first' } },
    );
    const first = result.current;
    expect(first.isCurrent()).toBe(true);
    rerender({ destination: 'second' });
    expect(first.isCurrent()).toBe(false);
    rerender({ destination: 'first' });
    expect(first.isCurrent()).toBe(false);
    expect(result.current.isCurrent()).toBe(true);
  });

  it('revokes old account and same-owner session callbacks', () => {
    const { result } = renderHook(() => useLibraryPickerScope('new-chat'));
    const first = result.current;
    act(() => activateCloudAccount('owner-b'));
    expect(first.isCurrent()).toBe(false);
    const second = result.current;
    act(() => { invalidateCloudAccount(); activateCloudAccount('owner-b'); });
    expect(second.isCurrent()).toBe(false);
    expect(result.current.isCurrent()).toBe(true);
  });

  it('revokes cloud callbacks in Local mode and on unmount', () => {
    const { result, unmount } = renderHook(() => useLibraryPickerScope('new-chat'));
    const cloud = result.current;
    act(() => useChatAppModeStore.setState({ appMode: 'local' }));
    expect(cloud.isCurrent()).toBe(false);
    const local = result.current;
    expect(local.isCurrent()).toBe(true);
    unmount();
    expect(local.isCurrent()).toBe(false);
  });
});
