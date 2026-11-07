import { act, renderHook } from '@testing-library/react-native';
import { useComposerAttachmentScope } from '../useComposerAttachmentScope';
import { useChatAppModeStore } from '../store/appModeStore';
import type { DraftProvenance } from '../draftStore';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
  invalidateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';

function useScope(destination: string, provenance: DraftProvenance | undefined) {
  const mode = useChatAppModeStore((state) => state.appMode);
  return useComposerAttachmentScope(destination, provenance, mode);
}

const cloud = { scope: 'cloud', ownerId: 'owner-a' } as const;
const local = { scope: 'local' } as const;

describe('composer attachment operation ownership', () => {
  beforeEach(() => {
    __resetCloudAccountSessionForTests();
    activateCloudAccount('owner-a');
    useChatAppModeStore.setState({ appMode: 'cloud' });
  });

  it('retires destination ABA and retained capture methods', () => {
    const { result, rerender } = renderHook(({ destination }) => useScope(destination, cloud), {
      initialProps: { destination: 'first' },
    });
    const captureFirst = result.current;
    const first = captureFirst('cloud')!;
    rerender({ destination: 'second' });
    expect(first.isCurrent()).toBe(false);
    expect(captureFirst('cloud')).toBeNull();
    rerender({ destination: 'first' });
    expect(first.isCurrent()).toBe(false);
    expect(captureFirst('cloud')).toBeNull();
    expect(result.current('cloud')?.isCurrent()).toBe(true);
  });

  it('retires mode ABA even when React batches both store updates', () => {
    const { result } = renderHook(() => useScope('first', cloud));
    const first = result.current('cloud')!;
    act(() => {
      useChatAppModeStore.setState({ appMode: 'local' });
      useChatAppModeStore.setState({ appMode: 'cloud' });
    });
    expect(first.isCurrent()).toBe(false);
    expect(result.current('cloud')?.isCurrent()).toBe(true);
  });

  it('rejects account replacement and same-owner session ABA', () => {
    const { result } = renderHook(() => useScope('first', cloud));
    const first = result.current('cloud')!;
    act(() => activateCloudAccount('owner-b'));
    expect(first.isCurrent()).toBe(false);
    expect(result.current('cloud')).toBeNull();
    act(() => activateCloudAccount('owner-a'));
    expect(first.isCurrent()).toBe(false);
    const second = result.current('cloud')!;
    act(() => {
      invalidateCloudAccount();
      activateCloudAccount('owner-a');
    });
    expect(second.isCurrent()).toBe(false);
  });

  it('keeps Local operations independent of account-only changes', () => {
    useChatAppModeStore.setState({ appMode: 'local' });
    const { result } = renderHook(() => useScope('first', local));
    const first = result.current('local')!;
    act(() => {
      invalidateCloudAccount();
      activateCloudAccount('owner-b');
    });
    expect(first.isCurrent()).toBe(true);
  });

  it('distinguishes conversation execution from global validation mode', () => {
    const { result } = renderHook(() => useScope('local-conversation', local));
    expect(result.current('cloud')).toBeNull();
    const first = result.current('local')!;
    expect(first.isCurrent()).toBe(true);
    act(() => useChatAppModeStore.setState({ appMode: 'local' }));
    expect(first.isCurrent()).toBe(false);
    expect(result.current('local')?.isCurrent()).toBe(true);
  });

  it('retires committed provenance changes and rejects unowned drafts', () => {
    const { result, rerender } = renderHook(
      ({ provenance }: { provenance: DraftProvenance | undefined }) =>
        useScope(`first:${provenance?.scope ?? 'unowned'}`, provenance),
      { initialProps: { provenance: cloud as DraftProvenance | undefined } },
    );
    const first = result.current('cloud')!;
    rerender({ provenance: local });
    expect(first.isCurrent()).toBe(false);
    rerender({ provenance: undefined });
    expect(result.current('local')).toBeNull();
  });

  it('preserves concurrent same-destination operations and retires them on unmount', () => {
    const { result, rerender, unmount } = renderHook(() => useScope('first', cloud));
    const first = result.current('cloud')!;
    const second = result.current('cloud')!;
    rerender(undefined);
    expect(first.isCurrent()).toBe(true);
    expect(second.isCurrent()).toBe(true);
    unmount();
    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(false);
    expect(result.current('cloud')).toBeNull();
  });
});
