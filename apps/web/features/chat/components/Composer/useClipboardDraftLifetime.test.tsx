import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useProjectStore } from '@features/projects';
import { useLocalModelSelection } from '@features/desktop-host';
import { localModelId } from '@agiworkforce/local-runtime-contract';
import { useClipboardDraftLifetime } from './use-clipboard-draft-lifetime';

const identity = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: false, userId: null, sessionId: null },
  sdk: { loaded: true, user: null, session: null },
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => identity.auth,
  useClerk: () => identity.sdk,
}));

function options() {
  return {
    conversationId: null as string | null,
    projectId: null as string | null,
    pickerProjectId: null as string | null,
    pickerOwned: false,
    onRetire: vi.fn(),
  };
}

type Read = ReturnType<ReturnType<typeof useClipboardDraftLifetime>['begin']>;

beforeEach(() => {
  identity.auth.isLoaded = true;
  identity.sdk.loaded = true;
  useChatStore.setState({ activeConversationId: null, conversations: [] });
  useProjectStore.setState({ activeProjectId: null });
  useLocalModelSelection.setState({ selected: null });
});

describe('clipboard draft read ownership', () => {
  it('keeps concurrent same-draft reads current until each finishes', () => {
    const { result } = renderHook(() => useClipboardDraftLifetime(options()));
    let first!: Read;
    let second!: Read;
    act(() => {
      first = result.current.begin();
      second = result.current.begin();
    });
    expect(first.isCurrent()).toBe(true);
    expect(second.isCurrent()).toBe(true);
    expect(result.current.readingClipboard).toBe(true);
    act(() => first.finish());
    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
    expect(result.current.readingClipboard).toBe(true);
    act(() => first.finish());
    expect(result.current.readingClipboard).toBe(true);
    act(() => second.finish());
    expect(result.current.readingClipboard).toBe(false);
  });

  it('does not let a retired group finalizer release a newer read', () => {
    const props = options();
    const { result } = renderHook(() => useClipboardDraftLifetime(props));
    let old!: Read;
    let current!: Read;
    act(() => {
      old = result.current.begin();
    });
    act(() => result.current.retire());
    expect(props.onRetire).toHaveBeenCalledOnce();
    expect(old.isCurrent()).toBe(false);
    act(() => {
      current = result.current.begin();
    });
    act(() => old.finish());
    expect(result.current.readingClipboard).toBe(true);
    expect(current.isCurrent()).toBe(true);
    act(() => current.finish());
    expect(result.current.readingClipboard).toBe(false);
  });

  it('retires navigation before a render and does not revive on navigation back', () => {
    const props = options();
    const { result } = renderHook(() => useClipboardDraftLifetime(props));
    let read!: Read;
    act(() => {
      read = result.current.begin();
    });
    act(() => useChatStore.setState({ activeConversationId: 'conversation-b' }));
    expect(read.isCurrent()).toBe(false);
    expect(result.current.readingClipboard).toBe(false);
    expect(props.onRetire).toHaveBeenCalledOnce();
    act(() => useChatStore.setState({ activeConversationId: null }));
    expect(read.isCurrent()).toBe(false);
  });

  it('retires picker-owned drafts when the project store changes', () => {
    const props = { ...options(), pickerOwned: true };
    const { result } = renderHook(() => useClipboardDraftLifetime(props));
    let read!: Read;
    act(() => {
      read = result.current.begin();
    });
    act(() => useProjectStore.setState({ activeProjectId: 'project-b' }));
    expect(read.isCurrent()).toBe(false);
    expect(result.current.readingClipboard).toBe(false);
  });

  it('keeps an explicitly owned project draft through unrelated picker and chat changes', () => {
    const props = { ...options(), projectId: 'project-a', pickerOwned: true };
    const { result } = renderHook(() => useClipboardDraftLifetime(props));
    let read!: Read;
    act(() => {
      read = result.current.begin();
    });
    act(() => useProjectStore.setState({ activeProjectId: 'project-b' }));
    act(() => useChatStore.setState({ activeConversationId: 'unrelated-chat' }));
    expect(read.isCurrent()).toBe(true);
    expect(props.onRetire).not.toHaveBeenCalled();
    act(() => read.finish());
  });

  it('retires Local reads on a cloud boundary change and never revives them', () => {
    const local = {
      id: localModelId('ollama', 'clipboard-fixture'),
      serverId: 'ollama' as const,
      serverLabel: 'Local fixture',
      name: 'clipboard-fixture',
    };
    useLocalModelSelection.setState({ selected: local });
    const props = options();
    const { result } = renderHook(() => useClipboardDraftLifetime(props));
    let read!: Read;
    act(() => {
      read = result.current.begin();
    });
    act(() => useLocalModelSelection.setState({ selected: null }));
    expect(read.isCurrent()).toBe(false);
    expect(result.current.readingClipboard).toBe(false);
    expect(props.onRetire).toHaveBeenCalledOnce();
    act(() => useLocalModelSelection.setState({ selected: local }));
    expect(read.isCurrent()).toBe(false);
  });

  it('preserves reads when only the Local model changes within the same boundary', () => {
    const local = {
      id: localModelId('ollama', 'clipboard-fixture'),
      serverId: 'ollama' as const,
      serverLabel: 'Local fixture',
      name: 'clipboard-fixture',
    };
    useLocalModelSelection.setState({ selected: local });
    const props = options();
    const { result } = renderHook(() => useClipboardDraftLifetime(props));
    let read!: Read;
    act(() => {
      read = result.current.begin();
    });
    act(() =>
      useLocalModelSelection.setState({
        selected: {
          ...local,
          id: localModelId('ollama', 'other-clipboard-fixture'),
          name: 'other-clipboard-fixture',
        },
      }),
    );
    expect(read.isCurrent()).toBe(true);
    expect(props.onRetire).not.toHaveBeenCalled();
    act(() => read.finish());
  });

  it('retires a changed conversation prop without waiting for the store', () => {
    const props = options();
    const { result, rerender } = renderHook(useClipboardDraftLifetime, { initialProps: props });
    let read!: Read;
    act(() => {
      read = result.current.begin();
    });
    rerender({ ...props, conversationId: 'conversation-b' });
    expect(read.isCurrent()).toBe(false);
    expect(result.current.readingClipboard).toBe(false);
    expect(props.onRetire).toHaveBeenCalledOnce();
  });

  it('retires when the saved conversation moves to another project', () => {
    const conversation = {
      id: 'conversation-a',
      title: 'Draft owner',
      createdAt: '2026-11-04T00:00:00Z',
      updatedAt: '2026-11-04T00:00:00Z',
      projectId: 'project-a',
    };
    useChatStore.setState({ activeConversationId: conversation.id, conversations: [conversation] });
    const props = { ...options(), conversationId: conversation.id };
    const { result } = renderHook(() => useClipboardDraftLifetime(props));
    let read!: Read;
    act(() => {
      read = result.current.begin();
    });
    act(() =>
      useChatStore.setState({ conversations: [{ ...conversation, projectId: 'project-b' }] }),
    );
    expect(read.isCurrent()).toBe(false);
    expect(result.current.readingClipboard).toBe(false);
    expect(props.onRetire).toHaveBeenCalledOnce();
  });

  it('cancels the queued work before exposing an idle retired group', () => {
    const observations: boolean[] = [];
    const props = options();
    const { result } = renderHook(() => useClipboardDraftLifetime(props));
    props.onRetire.mockImplementation(() => observations.push(result.current.readingClipboard));
    act(() => {
      result.current.begin();
    });
    act(() => result.current.retire());
    expect(observations).toEqual([true]);
    expect(result.current.readingClipboard).toBe(false);
  });

  it('retires an identity readiness change and ignores its late finalizer', () => {
    const props = options();
    const { result } = renderHook(() => useClipboardDraftLifetime(props));
    let read!: Read;
    act(() => {
      read = result.current.begin();
    });
    act(() => {
      identity.sdk.loaded = false;
      expect(read.isCurrent()).toBe(false);
    });
    expect(props.onRetire).toHaveBeenCalledOnce();
    expect(result.current.readingClipboard).toBe(false);
    act(() => read.finish());
    expect(props.onRetire).toHaveBeenCalledOnce();
  });

  it('retires on unmount before late completion', () => {
    const props = options();
    const { result, unmount } = renderHook(() => useClipboardDraftLifetime(props));
    let read!: Read;
    act(() => {
      read = result.current.begin();
    });
    unmount();
    expect(props.onRetire).toHaveBeenCalledOnce();
    expect(read.isCurrent()).toBe(false);
    act(() => read.finish());
    expect(props.onRetire).toHaveBeenCalledOnce();
  });
});
