import { StrictMode } from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ComposerEditorHandle,
  ComposerEditorProps,
} from '@agiworkforce/unified-chat/composer-editor';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useBillingStore, type SubscriptionPlan } from '@shared/stores/web-auth-store';
import { readPersistedDraft, writePersistedDraft } from './composer-draft-storage';
import { ChatComposerNew } from './ChatComposerNew';

/**
 * The in-memory draft store dies with the document, so every case here removes
 * the store and asks what the composer can still put back: a reload, a crash
 * that never reached the unmount cleanup, and the same sign-out and
 * cross-conversation rules the memory-only path already holds.
 */
const { editorHandle, editorProps } = vi.hoisted(() => ({
  editorHandle: {
    setText: vi.fn(),
    insertText: vi.fn(),
    appendText: vi.fn(),
    clear: vi.fn(),
    focus: vi.fn(),
    getText: vi.fn(() => ''),
    isEmpty: vi.fn(() => true),
  },
  editorProps: { current: null as ComposerEditorProps | null },
}));

vi.mock('@agiworkforce/unified-chat/composer-editor', async () => {
  const { forwardRef, useImperativeHandle } = await import('react');
  return {
    ComposerEditor: forwardRef<ComposerEditorHandle, ComposerEditorProps>(
      function FakeComposerEditor(props, ref) {
        editorProps.current = props;
        useImperativeHandle(ref, () => editorHandle, []);
        return (
          <div
            data-composer-textarea
            role="textbox"
            aria-multiline="true"
            aria-label={props.ariaLabel}
          />
        );
      },
    ),
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

vi.mock('@features/settings/components/SettingsModalProvider', () => ({
  useSettingsModal: () => ({ isOpen: false, openSettings: vi.fn(), closeSettings: vi.fn() }),
}));

vi.mock('@features/chat/hooks/use-skills-list', () => ({
  useSkillsList: () => ({ skills: [], loading: false, error: null }),
}));

vi.mock('@features/chat/hooks/use-media-model-availability', () => ({
  useMediaModelAvailability: () => ({
    status: 'ready',
    error: null,
    admissionFor: vi.fn(),
    retry: vi.fn(),
  }),
}));

vi.mock('./VoiceInputButton', () => ({ VoiceInputButton: () => null }));

vi.mock('@features/connectors/hooks/use-connectors', () => ({
  useConnectors: () => ({
    connectedIds: new Set<string>(),
    sources: {} as Record<string, string>,
    customNames: {} as Record<string, string>,
    toolConnectorIds: {} as Record<string, string>,
  }),
}));

const PRO_SUBSCRIPTION: SubscriptionPlan = {
  tier: 'pro',
  display_name: 'Pro',
  status: 'active',
  current_period_end: null,
  plan_name: 'Pro',
};

const DRAFT = 'half-typed thought';

function textarea(scope: ParentNode = document): HTMLTextAreaElement {
  const node = scope.querySelector('textarea');
  if (!node) throw new Error('the textarea arm did not mount');
  return node;
}

function typeInTextarea(value: string, scope?: ParentNode) {
  fireEvent.change(textarea(scope), { target: { value } });
}

function draftStorageKeys(): string[] {
  return Object.keys(window.localStorage).filter((key) => key.startsWith('agi-composer-draft'));
}

/** A reload keeps localStorage and nothing else. */
function simulateDocumentReload() {
  useChatStore.setState({
    draftsByConversation: {},
    draftContent: '',
    composerTogglesByConversation: {},
  });
  window.sessionStorage.clear();
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  useBillingStore.setState({ subscription: PRO_SUBSCRIPTION });
  useChatStore.setState({
    draftsByConversation: {},
    draftContent: '',
    composerTogglesByConversation: {},
    activeConversationId: null,
    conversations: [] as never,
    pendingTemporaryChat: false,
  });
});

afterEach(() => {
  editorProps.current = null;
  editorHandle.setText.mockClear();
});

describe('the persisted draft record', () => {
  it('round-trips the text it was given', () => {
    expect(writePersistedDraft('conv-1', DRAFT)).toBe(true);

    expect(readPersistedDraft('conv-1')).toBe(DRAFT);
  });

  it('stores an emptied draft as the absence of a key', () => {
    writePersistedDraft('conv-1', DRAFT);

    writePersistedDraft('conv-1', '   ');

    expect(readPersistedDraft('conv-1')).toBe('');
    expect(draftStorageKeys()).toHaveLength(0);
  });

  it('keeps each conversation to its own key', () => {
    writePersistedDraft('conv-1', DRAFT);

    expect(readPersistedDraft('conv-2')).toBe('');
    expect(readPersistedDraft(null)).toBe('');
  });

  it('ignores a record written by another version of the shape', () => {
    writePersistedDraft('conv-1', DRAFT);
    const key = draftStorageKeys()[0] as string;
    window.localStorage.setItem(key, JSON.stringify({ version: 99, text: DRAFT }));

    expect(readPersistedDraft('conv-1')).toBe('');
  });

  it('names itself so signing out reaps it with the rest of the app storage', () => {
    writePersistedDraft('conv-1', DRAFT);

    expect(draftStorageKeys()).toHaveLength(1);
    expect(draftStorageKeys().every((key) => /^agi[-_.]/i.test(key))).toBe(true);
  });
});

describe('a draft survives an interruption the user did not choose', () => {
  it('is on disk while the composer is still mounted, before any cleanup runs', () => {
    render(<ChatComposerNew onSend={vi.fn()} conversationId="conv-1" />);

    typeInTextarea(DRAFT);

    expect(readPersistedDraft('conv-1')).toBe(DRAFT);
  });

  it('comes back after a reload emptied the in-memory store', () => {
    const view = render(<ChatComposerNew onSend={vi.fn()} conversationId="conv-1" />);
    typeInTextarea(DRAFT);
    view.unmount();

    simulateDocumentReload();
    render(<ChatComposerNew onSend={vi.fn()} conversationId="conv-1" />);

    expect(textarea().value).toBe(DRAFT);
  });

  it('comes back after a crash that never ran the unmount cleanup', () => {
    const crashed = render(<ChatComposerNew onSend={vi.fn()} conversationId="conv-1" />);
    typeInTextarea(DRAFT, crashed.container);

    simulateDocumentReload();
    const reopened = render(<ChatComposerNew onSend={vi.fn()} conversationId="conv-1" />);

    expect(textarea(reopened.container).value).toBe(DRAFT);
  });

  it('survives the development double-mount', () => {
    writePersistedDraft('conv-1', DRAFT);

    render(<ChatComposerNew onSend={vi.fn()} conversationId="conv-1" />, { wrapper: StrictMode });

    expect(textarea().value).toBe(DRAFT);
    expect(readPersistedDraft('conv-1')).toBe(DRAFT);
  });

  it('leaves another conversation alone', () => {
    const view = render(<ChatComposerNew onSend={vi.fn()} conversationId="conv-1" />);
    typeInTextarea(DRAFT);
    view.unmount();

    simulateDocumentReload();
    render(<ChatComposerNew onSend={vi.fn()} conversationId="conv-2" />);

    expect(textarea().value).toBe('');
    expect(readPersistedDraft('conv-1')).toBe(DRAFT);
  });

  it('keeps nothing once the text has been sent', () => {
    const onSend = vi.fn();
    render(<ChatComposerNew onSend={onSend} conversationId="conv-1" />);

    typeInTextarea(DRAFT);
    fireEvent.keyDown(textarea(), { key: 'Enter' });

    expect(onSend).toHaveBeenCalled();
    expect(readPersistedDraft('conv-1')).toBe('');
  });

  it('writes nothing for a temporary chat, which promises to leave nothing behind', () => {
    useChatStore.setState({
      activeConversationId: 'conv-temp',
      conversations: [{ id: 'conv-temp', isTemporary: true }] as never,
    });

    render(<ChatComposerNew onSend={vi.fn()} conversationId="conv-temp" />);
    typeInTextarea(DRAFT);

    expect(readPersistedDraft('conv-temp')).toBe('');
  });

  it('clears a draft already on disk when temporary chat is armed mid-sentence', () => {
    const view = render(<ChatComposerNew onSend={vi.fn()} conversationId="conv-temp" />);
    typeInTextarea(DRAFT);
    expect(readPersistedDraft('conv-temp')).toBe(DRAFT);

    act(() =>
      useChatStore.setState({
        activeConversationId: 'conv-temp',
        conversations: [{ id: 'conv-temp', isTemporary: true }] as never,
      }),
    );

    expect(readPersistedDraft('conv-temp')).toBe('');
    view.unmount();
  });

  it('forgets a draft the user emptied by hand', () => {
    render(<ChatComposerNew onSend={vi.fn()} conversationId="conv-1" />);

    typeInTextarea(DRAFT);
    typeInTextarea('');

    expect(readPersistedDraft('conv-1')).toBe('');
  });
});

/**
 * Every new chat shares the unsaved surface's one draft slot, so the reload
 * has to be told apart from the next new chat the user opens. These two run in
 * this order on purpose: the claim is spent for the document, exactly as it is
 * in a browser.
 */
describe('the unsaved surface', () => {
  it('restores what was being typed when the document went down', () => {
    writePersistedDraft(null, DRAFT);

    render(<ChatComposerNew onSend={vi.fn()} conversationId={null} emptyState />);

    expect(textarea().value).toBe(DRAFT);
  });

  it('does not hand that draft to the next new chat opened in the same document', () => {
    writePersistedDraft(null, DRAFT);

    render(<ChatComposerNew onSend={vi.fn()} conversationId={null} emptyState />);

    expect(textarea().value).toBe('');
  });
});
