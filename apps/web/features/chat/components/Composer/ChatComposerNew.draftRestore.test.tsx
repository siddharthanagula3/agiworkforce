import { StrictMode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ComposerEditorHandle,
  ComposerEditorProps,
} from '@agiworkforce/unified-chat/composer-editor';
import { useChatStore, parkUnsentDraft } from '@shared/stores/web-chat-store';
import { useBillingStore, type SubscriptionPlan } from '@shared/stores/web-auth-store';
import {
  COMPOSER_EDITOR_MODES,
  COMPOSER_EDITOR_QUERY_PARAM,
} from '@features/chat/lib/composer-editor-gate';
import { ChatComposerNew } from './ChatComposerNew';

/**
 * The empty-state and in-conversation composers are different positions in
 * WebChatPage's ternary, so every switch between a chat and a new chat is an
 * unmount plus a mount rather than a re-render. These cover that pair: the
 * outgoing mount has to park what was typed and the incoming one has to read
 * it back, on both arms.
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

function pinEditorArm() {
  window.history.replaceState(
    {},
    '',
    `/?${COMPOSER_EDITOR_QUERY_PARAM}=${COMPOSER_EDITOR_MODES.editor}`,
  );
}

function textarea(): HTMLTextAreaElement {
  const node = document.querySelector('textarea');
  if (!node) throw new Error('the textarea arm did not mount');
  return node;
}

function typeInTextarea(value: string) {
  fireEvent.change(textarea(), { target: { value } });
}

function typeInEditor(value: string) {
  const props = editorProps.current;
  if (!props) throw new Error('the editor arm did not mount');
  act(() => props.onTextChange?.(value));
}

function draftFor(conversationId: string | null) {
  return useChatStore.getState().getDraftContent(conversationId);
}

beforeEach(() => {
  useBillingStore.setState({ subscription: PRO_SUBSCRIPTION });
  useChatStore.setState({
    draftsByConversation: {},
    draftContent: '',
    composerTogglesByConversation: {},
  });
});

afterEach(() => {
  window.history.replaceState({}, '', '/');
  editorProps.current = null;
  editorHandle.setText.mockClear();
});

describe('draft survives a composer remount · textarea arm', () => {
  it('parks what was typed when the composer unmounts', () => {
    const view = render(<ChatComposerNew onSend={vi.fn()} conversationId="conv-1" />);

    typeInTextarea(DRAFT);
    view.unmount();

    expect(draftFor('conv-1')).toBe(DRAFT);
  });

  it('restores the parked draft when the same conversation mounts again', () => {
    const view = render(<ChatComposerNew onSend={vi.fn()} conversationId="conv-1" />);
    typeInTextarea(DRAFT);
    view.unmount();

    render(<ChatComposerNew onSend={vi.fn()} conversationId="conv-1" />);

    expect(textarea().value).toBe(DRAFT);
  });

  it('leaves the composer empty when the remount lands on another conversation', () => {
    const view = render(<ChatComposerNew onSend={vi.fn()} conversationId="conv-1" />);
    typeInTextarea(DRAFT);
    view.unmount();

    render(<ChatComposerNew onSend={vi.fn()} conversationId="conv-2" />);

    expect(textarea().value).toBe('');
    expect(draftFor('conv-1')).toBe(DRAFT);
  });

  it('keeps a private draft out of the new chat the user opened next', () => {
    const view = render(<ChatComposerNew onSend={vi.fn()} conversationId="conv-1" />);
    typeInTextarea(DRAFT);
    view.unmount();

    render(<ChatComposerNew onSend={vi.fn()} conversationId={null} emptyState />);

    expect(textarea().value).toBe('');
  });

  it('parks nothing once the typed text has been sent', () => {
    const onSend = vi.fn();
    const view = render(<ChatComposerNew onSend={onSend} conversationId="conv-1" />);

    typeInTextarea(DRAFT);
    fireEvent.keyDown(textarea(), { key: 'Enter' });
    expect(onSend).toHaveBeenCalled();
    view.unmount();

    expect(draftFor('conv-1')).toBe('');
  });

  it('survives the development double-mount instead of parking over itself', () => {
    useChatStore.getState().setDraftContent(DRAFT, 'conv-1');

    render(<ChatComposerNew onSend={vi.fn()} conversationId="conv-1" />, { wrapper: StrictMode });

    expect(textarea().value).toBe(DRAFT);
    expect(draftFor('conv-1')).toBe(DRAFT);
  });

  it('still swaps drafts when the mounted composer switches conversation', () => {
    useChatStore.getState().setDraftContent('waiting in the other chat', 'conv-2');
    const view = render(<ChatComposerNew onSend={vi.fn()} conversationId="conv-1" />);
    typeInTextarea(DRAFT);

    view.rerender(<ChatComposerNew onSend={vi.fn()} conversationId="conv-2" />);

    expect(textarea().value).toBe('waiting in the other chat');
    expect(draftFor('conv-1')).toBe(DRAFT);
  });
});

/**
 * A send that 500s on the message save never reaches a model, and the composer
 * had already cleared. Reading the draft only on mount lost that text twice
 * over: an existing chat keeps the same composer instance mounted, and a brand
 * new chat mounts its replacement during the navigate that precedes the failure.
 */
describe('a send that never reached a model hands the text back', () => {
  it('writes a draft parked while the composer is mounted into an empty composer', () => {
    render(<ChatComposerNew onSend={vi.fn()} conversationId="conv-1" />);
    expect(textarea().value).toBe('');

    act(() => parkUnsentDraft('conv-1', DRAFT));

    expect(textarea().value).toBe(DRAFT);
  });

  it('leaves text typed since the failed send alone', () => {
    render(<ChatComposerNew onSend={vi.fn()} conversationId="conv-1" />);
    typeInTextarea('something newer');

    act(() => parkUnsentDraft('conv-1', DRAFT));

    expect(textarea().value).toBe('something newer');
  });

  it('ignores a handback aimed at another conversation', () => {
    render(<ChatComposerNew onSend={vi.fn()} conversationId="conv-1" />);

    act(() => parkUnsentDraft('conv-2', DRAFT));

    expect(textarea().value).toBe('');
  });

  it('reaches the new-chat composer, whose send failed before it had an id', () => {
    render(<ChatComposerNew onSend={vi.fn()} conversationId={null} emptyState />);

    act(() => parkUnsentDraft(null, DRAFT));

    expect(textarea().value).toBe(DRAFT);
  });

  it('reaches the replacement composer a first-message navigate mounted', () => {
    const view = render(<ChatComposerNew onSend={vi.fn()} conversationId={null} emptyState />);
    view.unmount();
    render(<ChatComposerNew onSend={vi.fn()} conversationId="conv-fresh" />);

    act(() => parkUnsentDraft('conv-fresh', DRAFT));

    expect(textarea().value).toBe(DRAFT);
  });

  it('shows a plain notice alongside the restored text (search-sources-4)', () => {
    render(<ChatComposerNew onSend={vi.fn()} conversationId="conv-1" />);

    act(() => parkUnsentDraft('conv-1', DRAFT));

    expect(screen.getByText("Couldn't send. Restored here so you can try again.")).toBeVisible();
  });

  it('clears the parked draft once it has been consumed, so nothing can replay it', () => {
    render(<ChatComposerNew onSend={vi.fn()} conversationId="conv-1" />);

    act(() => parkUnsentDraft('conv-1', DRAFT));

    expect(textarea().value).toBe(DRAFT);
    expect(draftFor('conv-1')).toBe('');
  });
});

describe('draft survives a composer remount · editor arm', () => {
  beforeEach(pinEditorArm);

  it('routes a handback through the editor handle', () => {
    render(<ChatComposerNew onSend={vi.fn()} conversationId="conv-1" />);
    editorHandle.setText.mockClear();

    act(() => parkUnsentDraft('conv-1', DRAFT));

    expect(editorHandle.setText).toHaveBeenCalledWith(DRAFT);
  });

  it('parks what was typed when the composer unmounts', () => {
    const view = render(<ChatComposerNew onSend={vi.fn()} conversationId="conv-1" />);

    typeInEditor(DRAFT);
    view.unmount();

    expect(draftFor('conv-1')).toBe(DRAFT);
  });

  it('routes the restore through the editor handle on the next mount', () => {
    useChatStore.getState().setDraftContent(DRAFT, 'conv-1');

    render(<ChatComposerNew onSend={vi.fn()} conversationId="conv-1" />);

    expect(editorHandle.setText).toHaveBeenCalledWith(DRAFT);
  });

  it('does not write another conversation draft into the editor', () => {
    useChatStore.getState().setDraftContent(DRAFT, 'conv-1');

    render(<ChatComposerNew onSend={vi.fn()} conversationId="conv-2" />);

    expect(editorHandle.setText).not.toHaveBeenCalledWith(DRAFT);
  });
});
