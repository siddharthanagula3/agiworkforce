import { createRef } from 'react';
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import type { ComposerEditorHandle } from '@agiworkforce/unified-chat/composer-editor';
import {
  COMPOSER_EDITOR_MODES,
  COMPOSER_EDITOR_QUERY_PARAM,
  COMPOSER_EDITOR_STORAGE_KEY,
} from '@features/chat/lib/composer-editor-gate';
import {
  ComposerInput,
  COMPOSER_INPUT_EMPTY_ROW_CLASS,
  COMPOSER_INPUT_ROW_CLASS,
  type ComposerInputProps,
} from '../ComposerInput';

// ProseMirror measures a caret rect on mount; jsdom's Range has neither method.
const ORIGIN_RECT = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  toJSON: () => ({}),
} as DOMRect;
const EMPTY_RECT_LIST = Object.assign([] as DOMRect[], {
  item: () => null,
}) as unknown as DOMRectList;
if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => EMPTY_RECT_LIST;
  Range.prototype.getBoundingClientRect = () => ORIGIN_RECT;
}

const ENV_KEY = 'NEXT_PUBLIC_COMPOSER_EDITOR';
const MAX_LENGTH = 4000;
const PLACEHOLDER = 'How can I help?';
const EDITOR_SELECTOR = '[data-composer-textarea][contenteditable]';

function setQuery(value: string | null) {
  const search = value === null ? '' : `?${COMPOSER_EDITOR_QUERY_PARAM}=${value}`;
  window.history.replaceState({}, '', `/${search}`);
}

function props(overrides: Partial<ComposerInputProps> = {}): ComposerInputProps {
  return {
    textareaRef: createRef<HTMLTextAreaElement>(),
    editorRef: createRef<ComposerEditorHandle>(),
    value: '',
    onChange: vi.fn(),
    onTextChange: vi.fn(),
    onKeyDown: vi.fn(),
    onPaste: vi.fn(),
    onPasteDecision: vi.fn(),
    onDropFiles: vi.fn(),
    onSubmit: vi.fn(),
    onFocusChange: vi.fn(),
    placeholder: PLACEHOLDER,
    disabled: false,
    maxLength: MAX_LENGTH,
    emptyState: false,
    ariaDescribedBy: undefined,
    existingFileNames: [],
    mention: { menu: {} },
    isSlashMenuActive: () => false,
    onSlashMenuKey: () => false,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  setQuery(null);
  window.localStorage.clear();
  delete process.env[ENV_KEY];
  vi.restoreAllMocks();
});

describe('ComposerInput gate', () => {
  it('renders the legacy textarea when nothing asks for the editor', () => {
    const view = render(<ComposerInput {...props()} />);

    expect(view.container.querySelector('textarea[data-composer-textarea]')).not.toBeNull();
    expect(view.container.querySelector(EDITOR_SELECTOR)).toBeNull();
  });

  it('mounts the rich editor when the query param pins it', async () => {
    setQuery(COMPOSER_EDITOR_MODES.editor);

    const view = render(<ComposerInput {...props()} />);

    await waitFor(() => expect(view.container.querySelector(EDITOR_SELECTOR)).not.toBeNull());
    expect(view.container.querySelector('textarea')).toBeNull();
  });

  it('mounts the rich editor from the build-time default', async () => {
    process.env[ENV_KEY] = COMPOSER_EDITOR_MODES.editor;

    const view = render(<ComposerInput {...props()} />);

    await waitFor(() => expect(view.container.querySelector(EDITOR_SELECTOR)).not.toBeNull());
  });

  it('attaches the editor handle only on the editor arm', async () => {
    const editorRef = createRef<ComposerEditorHandle>();
    const legacy = render(<ComposerInput {...props({ editorRef })} />);
    expect(editorRef.current).toBeNull();
    legacy.unmount();

    setQuery(COMPOSER_EDITOR_MODES.editor);
    render(<ComposerInput {...props({ editorRef })} />);

    await waitFor(() => expect(editorRef.current).not.toBeNull());
  });

  it('keeps the accessible contract identical across the two arms', async () => {
    const legacy = render(<ComposerInput {...props({ ariaDescribedBy: 'counter' })} />);
    const textarea = legacy.getByRole('textbox');
    expect(textarea.getAttribute('aria-label')).toBe('Message input');
    expect(textarea.getAttribute('aria-describedby')).toBe('counter');
    expect(textarea.getAttribute('dir')).toBe('auto');
    legacy.unmount();

    setQuery(COMPOSER_EDITOR_MODES.editor);
    const editor = render(<ComposerInput {...props({ ariaDescribedBy: 'counter' })} />);

    await waitFor(() => expect(editor.container.querySelector(EDITOR_SELECTOR)).not.toBeNull());
    const content = editor.getByRole('textbox');
    expect(content.getAttribute('aria-label')).toBe('Message input');
    expect(content.getAttribute('aria-describedby')).toBe('counter');
    expect(content.getAttribute('dir')).toBe('auto');
    expect(content.getAttribute('aria-multiline')).toBe('true');
  });
});

/**
 * The two arms render different elements, so the mode may not be resolved
 * during render: the query and storage overrides are client-only, and a server
 * render that honoured them would hydrate against markup the browser never
 * produced.
 */
describe('ComposerInput hydration', () => {
  it('server-renders the build default even while an override asks for the editor', () => {
    window.localStorage.setItem(COMPOSER_EDITOR_STORAGE_KEY, COMPOSER_EDITOR_MODES.editor);
    setQuery(COMPOSER_EDITOR_MODES.editor);

    expect(renderToString(<ComposerInput {...props()} />)).toContain('<textarea');
  });

  it('hydrates without a mismatch and then swaps to the overridden arm', async () => {
    window.localStorage.setItem(COMPOSER_EDITOR_STORAGE_KEY, COMPOSER_EDITOR_MODES.editor);
    const element = <ComposerInput {...props()} />;
    const container = document.createElement('div');
    container.innerHTML = renderToString(element);
    document.body.appendChild(container);
    const errors: unknown[][] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args);
    });

    const root = await act(async () => hydrateRoot(container, element));

    expect(errors).toEqual([]);
    await waitFor(() => expect(container.querySelector(EDITOR_SELECTOR)).not.toBeNull());
    await act(async () => root.unmount());
    container.remove();
  });
});

/**
 * M11: the resting composer ran to ~130px at 390px against ChatGPT's ~87px.
 * These are the mobile steps; every `sm:` half restores the desktop value the
 * slice deliberately did not touch.
 */
describe('ComposerInput mobile density', () => {
  it('gives the textarea a shorter resting row below sm and the old one above it', () => {
    const view = render(<ComposerInput {...props()} />);

    const textarea = view.getByRole('textbox');
    for (const token of COMPOSER_INPUT_ROW_CLASS.split(' ')) {
      expect(textarea).toHaveClass(token);
    }
  });

  it('uses the empty-state row on the new-chat surface', () => {
    const view = render(<ComposerInput {...props({ emptyState: true })} />);

    const textarea = view.getByRole('textbox');
    for (const token of COMPOSER_INPUT_EMPTY_ROW_CLASS.split(' ')) {
      expect(textarea).toHaveClass(token);
    }
  });

  it('applies the same mobile step to the editor arm, which has no textarea utilities', async () => {
    setQuery(COMPOSER_EDITOR_MODES.editor);

    const view = render(<ComposerInput {...props()} />);

    await waitFor(() => expect(view.container.querySelector(EDITOR_SELECTOR)).not.toBeNull());
    const root = view.container.querySelector('.composer-editor');
    expect(root).toHaveClass('[&_.ProseMirror]:min-h-[36px]');
    expect(root).toHaveClass('sm:[&_.ProseMirror]:min-h-[52px]');
  });
});

/**
 * The editor arrives two commits after the arm is chosen, so a handle write
 * issued before that is dropped on a null ref. The draft restored on mount is
 * the write that bites: the mirror keeps it, the document never receives it,
 * and the composer comes back visibly empty with the text still in state.
 */
describe('ComposerInput editor seeding', () => {
  it('takes the mirror into the document when the editor mounts after the write', async () => {
    setQuery(COMPOSER_EDITOR_MODES.editor);
    const editorRef = createRef<ComposerEditorHandle>();

    const view = render(<ComposerInput {...props({ editorRef, value: 'restored draft' })} />);

    await waitFor(() => expect(view.container.querySelector(EDITOR_SELECTOR)).not.toBeNull());
    await waitFor(() => expect(editorRef.current?.getText()).toBe('restored draft'));
    expect(view.container.querySelector(EDITOR_SELECTOR)).toHaveTextContent('restored draft');
  });

  it('leaves an empty mirror alone', async () => {
    setQuery(COMPOSER_EDITOR_MODES.editor);
    const editorRef = createRef<ComposerEditorHandle>();

    const view = render(<ComposerInput {...props({ editorRef })} />);

    await waitFor(() => expect(view.container.querySelector(EDITOR_SELECTOR)).not.toBeNull());
    expect(editorRef.current?.isEmpty()).toBe(true);
  });

  it('never clobbers a document the viewer has already typed into', async () => {
    setQuery(COMPOSER_EDITOR_MODES.editor);
    const editorRef = createRef<ComposerEditorHandle>();
    const view = render(<ComposerInput {...props({ editorRef, value: 'seed' })} />);
    await waitFor(() => expect(editorRef.current?.getText()).toBe('seed'));

    // A later render carrying a different mirror must not rewrite the document;
    // the editor is uncontrolled and the host writes through the handle.
    view.rerender(<ComposerInput {...props({ editorRef, value: 'something else' })} />);

    expect(editorRef.current?.getText()).toBe('seed');
  });
});
