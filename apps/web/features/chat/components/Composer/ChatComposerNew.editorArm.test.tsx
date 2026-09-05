import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ComposerEditorHandle,
  ComposerEditorProps,
  ComposerMentionCommit,
} from '@agiworkforce/unified-chat/composer-editor';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useSettingsStore } from '@shared/stores/web-settings-store';
import { useBillingStore, type SubscriptionPlan } from '@shared/stores/web-auth-store';
import {
  COMPOSER_EDITOR_MODES,
  COMPOSER_EDITOR_QUERY_PARAM,
} from '@features/chat/lib/composer-editor-gate';
import { ChatComposerNew } from './ChatComposerNew';

/**
 * The editor arm is exercised against a double rather than against TipTap: what
 * this suite is proving is the ROUTING: that each of the writers the composer
 * owns reaches the imperative handle instead of only the mirrored state, and
 * that the menu adapters answer the plugin correctly. The real editor is mounted
 * by `__tests__/ComposerInput.test.tsx`, and the handle's own semantics are
 * covered in the unified-chat package.
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
            dir="auto"
            aria-label={props.ariaLabel}
            aria-describedby={props.ariaDescribedBy}
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
  useSkillsList: () => ({
    skills: [
      { name: 'Doc Writer', description: 'Writes documents', source: 'included' },
      { name: 'Data Cleaner', description: 'Cleans spreadsheets', source: 'included' },
    ],
    loading: false,
    error: null,
  }),
}));

vi.mock('@features/chat/hooks/use-media-model-availability', () => ({
  useMediaModelAvailability: () => ({
    status: 'ready',
    error: null,
    admissionFor: vi.fn(),
    retry: vi.fn(),
  }),
}));

vi.mock('@features/connectors/hooks/use-connectors', () => ({
  useConnectors: () => ({
    connectedIds: new Set<string>(),
    sources: {} as Record<string, string>,
    customNames: {} as Record<string, string>,
  }),
}));

const TRANSCRIPT = 'dictated tail';
vi.mock('./VoiceInputButton', () => ({
  VoiceInputButton: ({ onStart }: { onStart: () => void }) => (
    <button type="button" onClick={onStart}>
      Dictate
    </button>
  ),
}));

vi.mock('@features/chat/hooks/use-dictation', () => ({
  useDictation: ({ onInsert }: { onInsert: (text: string) => void }) => ({
    status: 'idle',
    isActive: false,
    error: null,
    bars: [],
    level: 0,
    announcement: '',
    reducedMotion: false,
    start: () => onInsert(TRANSCRIPT),
    stop: () => {},
    send: () => {},
    cancel: () => {},
    retry: () => {},
  }),
}));

const PRO_SUBSCRIPTION: SubscriptionPlan = {
  tier: 'pro',
  display_name: 'Pro',
  status: 'active',
  current_period_end: null,
  plan_name: 'Pro',
};

function editor(): ComposerEditorProps {
  const props = editorProps.current;
  if (!props) throw new Error('the editor arm did not mount');
  return props;
}

/** The mirror the host keeps; the editor itself is uncontrolled. */
function type(value: string) {
  act(() => editor().onTextChange?.(value));
}

function submit() {
  act(() => editor().onSubmit?.());
}

function openMention(query: string): ComposerMentionCommit {
  const commit: ComposerMentionCommit = { insertMention: vi.fn(), removeQuery: vi.fn() };
  act(() => editor().mention?.menu.onOpen?.({ query, commit }));
  return commit;
}

function pressInMentionMenu(key: string, shiftKey = false): boolean {
  let consumed = false;
  act(() => {
    consumed =
      editor().mention?.menu.onKeyDown?.(new KeyboardEvent('keydown', { key, shiftKey })) ?? false;
  });
  return consumed;
}

/** Attachment previews show a thumbnail for images and the name for documents. */
function textFile(name: string, body: string): File {
  return new File([body], name, { type: 'text/plain' });
}

/** Rows come from the shared menu, which commits on mousedown, not click. */
function pickMenuRow(name: RegExp) {
  fireEvent.mouseDown(screen.getByRole('option', { name }));
}

beforeEach(() => {
  window.history.replaceState(
    {},
    '',
    `/?${COMPOSER_EDITOR_QUERY_PARAM}=${COMPOSER_EDITOR_MODES.editor}`,
  );
  useBillingStore.setState({ subscription: PRO_SUBSCRIPTION });
  // Composer toggles and drafts live in the chat store, so they outlive a
  // render and would otherwise leak an image mode or a skill into the next test.
  window.sessionStorage.clear();
  useChatStore.setState({
    composerTogglesByConversation: {},
    draftsByConversation: {},
    draftContent: '',
  });
});

afterEach(() => {
  window.history.replaceState({}, '', '/');
  editorProps.current = null;
  useSettingsStore.setState({ customCommands: [] });
});

describe('editor arm · the composer mounts it', () => {
  it('renders the editor instead of the textarea when the query pins it', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    expect(screen.getByRole('textbox', { name: /message input/i })).not.toBeNull();
    expect(document.querySelector('textarea')).toBeNull();
  });
});

/**
 * Every external write must reach the handle: the editor is uncontrolled, so a
 * `setMessage` that does not replay through it leaves the visible document
 * behind the state the counter, the draft store and the send path all read.
 */
describe('editor arm · external message writers', () => {
  it('routes a prefill through setText', () => {
    const view = render(<ChatComposerNew onSend={vi.fn()} />);

    view.rerender(<ChatComposerNew onSend={vi.fn()} prefillText="drafted for you" />);

    expect(editorHandle.setText).toHaveBeenCalledWith('drafted for you');
  });

  it('routes a slash-menu commit through setText and refocuses', async () => {
    useSettingsStore.setState({
      customCommands: [
        { id: 'brief', name: 'brief', description: 'Brief', template: 'Write a brief about' },
      ],
    });
    render(<ChatComposerNew onSend={vi.fn()} />);

    type('/brief');
    pickMenuRow(/\/brief/);

    expect(editorHandle.setText).toHaveBeenCalledWith('Write a brief about');
    await waitFor(() => expect(editorHandle.focus).toHaveBeenCalled());
  });

  it('routes a skill pick from the slash menu through setText with the token stripped', async () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    type('/doc');
    pickMenuRow(/Doc Writer/);

    expect(editorHandle.setText).toHaveBeenCalledWith('');
    await waitFor(() => expect(editorHandle.focus).toHaveBeenCalled());
  });

  it('routes the "command applied, nothing to send" restore through setText', () => {
    useSettingsStore.setState({
      customCommands: [{ id: 'noop', name: 'noop', description: 'No body', template: '' }],
    });
    render(<ChatComposerNew onSend={vi.fn()} />);

    type('/noop');
    editorHandle.setText.mockClear();
    submit();

    expect(editorHandle.setText).toHaveBeenCalledWith('');
  });

  it('routes a per-conversation draft restore through setText', () => {
    useChatStore.getState().setDraftContent('parked in the other chat', 'conv-2');
    const view = render(<ChatComposerNew onSend={vi.fn()} conversationId="conv-1" />);

    editorHandle.setText.mockClear();
    view.rerender(<ChatComposerNew onSend={vi.fn()} conversationId="conv-2" />);

    expect(editorHandle.setText).toHaveBeenCalledWith('parked in the other chat');
  });

  it('routes a queued-message edit through setText and refocuses', async () => {
    render(<ChatComposerNew onSend={vi.fn()} isLoading isGenerating />);

    type('typo herre');
    submit();

    editorHandle.setText.mockClear();
    fireEvent.click(await screen.findByRole('button', { name: /Edit queued message: typo herre/ }));

    expect(editorHandle.setText).toHaveBeenCalledWith('typo herre');
    expect(editorHandle.focus).toHaveBeenCalled();
  });

  it('routes the long-paste undo through appendText', async () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    const file = textFile('Pasted text.txt', 'the long pasted body');

    act(() => editor().onPasteDecision?.({ kind: 'attachment', file }));

    fireEvent.click(await screen.findByTestId('pasted-text-undo'));
    await waitFor(() =>
      expect(editorHandle.appendText).toHaveBeenCalledWith('the long pasted body'),
    );
    expect(editorHandle.focus).toHaveBeenCalled();
  });

  it('routes a dictated transcript through appendText', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    type('already typed');
    fireEvent.click(screen.getByRole('button', { name: 'Dictate' }));

    expect(editorHandle.appendText).toHaveBeenCalledWith(` ${TRANSCRIPT}`);
  });

  it('clears the editor when the message is sent', () => {
    const onSend = vi.fn();
    render(<ChatComposerNew onSend={onSend} />);

    type('ship it');
    submit();

    expect(onSend).toHaveBeenCalledOnce();
    expect(editorHandle.clear).toHaveBeenCalled();
  });
});

describe('editor arm · slash menu', () => {
  it('opens on a bare token and reports itself active to the keymap', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    type('/sea');

    expect(editor().isSlashMenuActive?.()).toBe(true);
  });

  it('closes once the token takes an argument, so Enter sends again', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    type('/search');
    type('/search latest news');

    expect(editor().isSlashMenuActive?.()).toBe(false);
  });

  it('hands navigation keys to the menu and leaves the rest alone', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    type('/');

    expect(editor().onSlashMenuKey?.('ArrowDown')).toBe(true);
    expect(editor().onSlashMenuKey?.('q')).toBe(false);
  });

  it('does not submit while the menu owns Enter', () => {
    const onSend = vi.fn();
    render(<ChatComposerNew onSend={onSend} />);

    type('/search');
    // The keymap consults the host before submitting; an active menu means the
    // editor never calls onSubmit at all.
    expect(editor().isSlashMenuActive?.()).toBe(true);
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe('editor arm · mention menu', () => {
  it('mirrors the suggestion query into the existing menu', async () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    openMention('doc');

    expect(await screen.findByRole('option', { name: /Doc Writer/ })).toBeVisible();
  });

  it('strips the query through the suggestion range and selects the skill', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    const commit = openMention('doc');

    expect(pressInMentionMenu('Enter')).toBe(true);

    expect(commit.removeQuery).toHaveBeenCalledOnce();
    expect(commit.insertMention).not.toHaveBeenCalled();
    expect(screen.getByText('/Doc Writer')).toBeVisible();
  });

  /**
   * The suggestion range knows where the query sat and restores focus there.
   * The handle's focus() takes the caret to the end of the document, which on a
   * mention picked mid-message is a visible jump.
   */
  it('leaves the caret where the removal collapsed', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    const commit = openMention('doc');
    editorHandle.focus.mockClear();

    expect(pressInMentionMenu('Enter')).toBe(true);

    expect(commit.removeQuery).toHaveBeenCalledOnce();
    expect(editorHandle.focus).not.toHaveBeenCalled();
  });

  it('commits on Tab as well as Enter', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    const commit = openMention('doc');

    expect(pressInMentionMenu('Tab')).toBe(true);
    expect(commit.removeQuery).toHaveBeenCalledOnce();
  });

  it('wraps the highlight with the arrow keys', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    const commit = openMention('');

    expect(pressInMentionMenu('ArrowUp')).toBe(true);
    pressInMentionMenu('Enter');

    expect(commit.removeQuery).toHaveBeenCalledOnce();
    expect(screen.getByText('/Data Cleaner')).toBeVisible();
  });

  /**
   * The plugin only takes a key off the keymap when this adapter says it did,
   * so an open-but-empty menu must answer false or it strands the message.
   */
  it('never swallows Enter when the menu has no rows', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    openMention('nobodymatchesthis');

    expect(pressInMentionMenu('Enter')).toBe(false);
    expect(pressInMentionMenu('ArrowDown')).toBe(false);
  });

  it('lets Escape through to the document-level closers', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    openMention('doc');

    expect(pressInMentionMenu('Escape')).toBe(false);
  });

  it('stops answering once the plugin closes the suggestion', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    openMention('doc');

    act(() => editor().mention?.menu.onClose?.());

    expect(pressInMentionMenu('Enter')).toBe(false);
  });
});

describe('editor arm · paste and drop', () => {
  it('attaches the files the shared decision produced', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    act(() => editor().onPasteDecision?.({ kind: 'files', files: [textFile('notes.txt', 'x')] }));

    expect(screen.getByText('notes.txt')).toBeVisible();
  });

  it('explains a long paste that became an attachment', async () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    act(() =>
      editor().onPasteDecision?.({ kind: 'attachment', file: textFile('Pasted text.txt', 'body') }),
    );

    expect(await screen.findByTestId('pasted-text-notice')).toHaveTextContent(
      /attached as Pasted text\.txt/i,
    );
  });

  it('feeds a drop on the editor into the same attachment path', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    act(() => editor().onDropFiles?.([textFile('dropped.txt', 'x')]));

    expect(screen.getByText('dropped.txt')).toBeVisible();
  });

  it('hands the editor the names it needs to de-duplicate a paste', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);

    act(() => editor().onPasteDecision?.({ kind: 'files', files: [textFile('notes.txt', 'x')] }));

    expect(editor().existingFileNames).toContain('notes.txt');
  });
});

/**
 * The menu opens on anything the draft predicate accepts, including a lone
 * slash the command parser cannot read. Committing from that state used to
 * write the slash back, so the menu closed and the token stayed put, and the
 * next thing typed landed behind it as "//search".
 */
describe('editor arm · committing from a bare slash', () => {
  it('consumes the slash instead of writing it back', async () => {
    useSettingsStore.setState({
      customCommands: [{ id: 'noop', name: 'noop', description: 'No body', template: '' }],
    });
    render(<ChatComposerNew onSend={vi.fn()} />);

    type('/');
    // The mount restore already wrote an empty document, so only the write the
    // commit itself makes can prove the token was consumed.
    editorHandle.setText.mockClear();
    pickMenuRow(/\/noop/);

    expect(editorHandle.setText).toHaveBeenCalledExactlyOnceWith('');
    await waitFor(() => expect(editorHandle.focus).toHaveBeenCalled());
  });

  it('still keeps the argument when the token is complete', () => {
    useSettingsStore.setState({
      customCommands: [
        { id: 'brief', name: 'brief', description: 'Brief', template: 'Write a brief' },
      ],
    });
    render(<ChatComposerNew onSend={vi.fn()} />);

    type('/brief');
    editorHandle.setText.mockClear();
    pickMenuRow(/\/brief/);

    expect(editorHandle.setText).toHaveBeenCalledExactlyOnceWith('Write a brief');
  });
});

/**
 * The whole journey happens on the unsaved surface, so both of these read the
 * same draft slot and demand opposite answers. What separates them is how the
 * user got there: a new chat is a push, a return is a history step.
 */
describe('editor arm · the unsaved surface draft', () => {
  function mount() {
    return render(<ChatComposerNew onSend={vi.fn()} />);
  }

  it('withholds the draft from a new chat and hands it back on the way back', () => {
    const typed = 'half-typed draft that belongs to this chat';
    const composing = mount();
    type(typed);
    composing.unmount();

    // The new chat the user opened on purpose starts blank.
    editorHandle.setText.mockClear();
    const newChat = mount();
    expect(editorHandle.setText).toHaveBeenCalledExactlyOnceWith('');
    newChat.unmount();

    // Stepping back to the surface they left returns what was on it.
    window.dispatchEvent(new PopStateEvent('popstate'));
    editorHandle.setText.mockClear();
    mount();
    expect(editorHandle.setText).toHaveBeenCalledExactlyOnceWith(typed);
  });

  it('does not resurrect a draft that was already sent', () => {
    const composing = mount();
    type('ship it');
    submit();
    composing.unmount();

    window.dispatchEvent(new PopStateEvent('popstate'));
    editorHandle.setText.mockClear();
    mount();

    expect(editorHandle.setText).toHaveBeenCalledExactlyOnceWith('');
  });
});
