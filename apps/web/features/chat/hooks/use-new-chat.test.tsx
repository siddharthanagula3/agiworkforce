import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  params: new URLSearchParams(),
  pathname: '/chat',
  setDraftContent: vi.fn(),
  setComposerToggles: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => mocks.params,
  usePathname: () => mocks.pathname,
}));
vi.mock('@shared/stores/web-chat-store', () => {
  const useChatStore = () => undefined;
  useChatStore.getState = () => ({
    setDraftContent: mocks.setDraftContent,
    setComposerToggles: mocks.setComposerToggles,
  });
  return { useChatStore, PENDING_CONVERSATION_KEY: '__new_conversation__' };
});

const { useNewChatEntry, useStartNewChat } = await import('./use-new-chat');

const MESSAGE_ID = 'c4f2a1b8-3e5d-4a6f-9b7c-1d2e3f4a5b6c';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.params = new URLSearchParams();
  mocks.pathname = '/chat';
});

describe('useStartNewChat', () => {
  it('navigates to a link carrying the source and the seeded draft', () => {
    const { result } = renderHook(() => useStartNewChat());

    result.current({ source: { kind: 'file', id: 'asset-1' }, draft: '> a line' });

    expect(mocks.push).toHaveBeenCalledWith('/chat?q=%3E+a+line&from=file%3Aasset-1');
  });

  it('navigates to a plain new chat when nothing is carried', () => {
    const { result } = renderHook(() => useStartNewChat());
    result.current();
    expect(mocks.push).toHaveBeenCalledWith('/chat');
  });
});

describe('useNewChatEntry', () => {
  it('prefills the pending composer and drops the parameters', () => {
    mocks.params = new URLSearchParams(`q=%3E+a+line&from=message%3A${MESSAGE_ID}&mode=agiwork`);

    renderHook(() => useNewChatEntry());

    expect(mocks.setComposerToggles).toHaveBeenCalledWith(
      { workMode: 'agiwork' },
      '__new_conversation__',
    );
    expect(mocks.setDraftContent).toHaveBeenCalledWith('> a line', '__new_conversation__');
    expect(mocks.replace).toHaveBeenCalledWith('/chat');
  });

  it('applies the link once, so a re-render does not overwrite what the user typed', () => {
    mocks.params = new URLSearchParams('q=seeded');

    const { rerender } = renderHook(() => useNewChatEntry());
    rerender();
    rerender();

    expect(mocks.setDraftContent).toHaveBeenCalledTimes(1);
  });

  it('keeps unrelated parameters when it strips its own', () => {
    mocks.params = new URLSearchParams('q=seeded&highlightMessage=abc');

    renderHook(() => useNewChatEntry());

    expect(mocks.replace).toHaveBeenCalledWith('/chat?highlightMessage=abc');
  });

  it('keeps a prefilled Quick Ask entry on its compact route', () => {
    mocks.pathname = '/quick-ask';
    mocks.params = new URLSearchParams('q=seeded');

    renderHook(() => useNewChatEntry());

    expect(mocks.setDraftContent).toHaveBeenCalledWith('seeded', '__new_conversation__');
    expect(mocks.replace).toHaveBeenCalledWith('/quick-ask');
  });

  it('starts a new compact chat when a prefill is opened on an existing Quick Ask path', () => {
    mocks.pathname = '/quick-ask/session-1';
    mocks.params = new URLSearchParams('q=seeded');

    renderHook(() => useNewChatEntry());

    expect(mocks.replace).toHaveBeenCalledWith('/quick-ask');
  });

  it('does not treat a similarly named path as Quick Ask', () => {
    mocks.pathname = '/quick-ask-other';
    mocks.params = new URLSearchParams('q=seeded');

    renderHook(() => useNewChatEntry());

    expect(mocks.replace).toHaveBeenCalledWith('/chat');
  });

  it('touches nothing when the url carries no entry', () => {
    mocks.params = new URLSearchParams('highlightMessage=abc');

    const { result } = renderHook(() => useNewChatEntry());

    expect(result.current).toBeNull();
    expect(mocks.setDraftContent).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
