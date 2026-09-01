import './dom-stubs';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { modifierKey } from './harness';
import {
  COMPOSER_EDITOR_ATTRIBUTE,
  COMPOSER_EDITOR_PLACEHOLDER_CLASS,
  ComposerEditor,
} from '../ComposerEditor';
import type { ComposerEditorHandle, ComposerEditorProps } from '../types';

afterEach(cleanup);

const ARIA_LABEL = 'Chat message input';
const PLACEHOLDER = 'How can I help?';

async function mountEditor(props: Partial<ComposerEditorProps> = {}) {
  const ref = createRef<ComposerEditorHandle>();
  const view = render(<ComposerEditor ref={ref} ariaLabel={ARIA_LABEL} {...props} />);
  await waitFor(() => expect(ref.current).not.toBeNull());
  const content = view.container.querySelector(`[${COMPOSER_EDITOR_ATTRIBUTE}]`);
  await waitFor(() => expect(content).not.toBeNull());
  return { ref, view, content: content as HTMLElement };
}

function handleOf(ref: React.RefObject<ComposerEditorHandle | null>): ComposerEditorHandle {
  const handle = ref.current;
  if (!handle) throw new Error('composer handle was not attached');
  return handle;
}

describe('ComposerEditorHandle', () => {
  it('round-trips text through setText and getText', async () => {
    const { ref } = await mountEditor();
    const handle = handleOf(ref);
    handle.setText('first\nsecond');
    expect(handle.getText()).toBe('first\nsecond');
    expect(handle.isEmpty()).toBe(false);
  });

  it('reports emptiness for the empty string', async () => {
    const { ref } = await mountEditor();
    const handle = handleOf(ref);
    handle.setText('something');
    handle.setText('');
    expect(handle.getText()).toBe('');
    expect(handle.isEmpty()).toBe(true);
  });

  it('mirrors every write through onTextChange', async () => {
    const onTextChange = vi.fn();
    const { ref } = await mountEditor({ onTextChange });
    const handle = handleOf(ref);
    handle.setText('restored draft');
    handle.appendText(' plus voice');
    handle.clear();
    expect(onTextChange.mock.calls.map(([text]) => text)).toEqual([
      'restored draft',
      'restored draft plus voice',
      '',
    ]);
  });

  it('appends single-line and multi-line text at the end', async () => {
    const { ref } = await mountEditor();
    const handle = handleOf(ref);
    handle.setText('one');
    handle.appendText(' two');
    expect(handle.getText()).toBe('one two');
    handle.appendText('\nthree\nfour');
    expect(handle.getText()).toBe('one two\nthree\nfour');
  });

  it('inserts at the caret that setText positioned', async () => {
    const { ref } = await mountEditor();
    const handle = handleOf(ref);
    handle.setText('tail', 'start');
    handle.insertText('head ');
    expect(handle.getText()).toBe('head tail');
  });

  it('clears the document', async () => {
    const { ref } = await mountEditor();
    const handle = handleOf(ref);
    handle.setText('sent message');
    handle.clear();
    expect(handle.getText()).toBe('');
    expect(handle.isEmpty()).toBe(true);
  });

  it('focuses without changing the text', async () => {
    const onFocusChange = vi.fn();
    const { ref } = await mountEditor({ onFocusChange });
    const handle = handleOf(ref);
    handle.setText('draft');
    handle.focus();
    expect(handle.getText()).toBe('draft');
    await waitFor(() => expect(onFocusChange).toHaveBeenCalledWith(true));
  });
});

describe('ComposerEditor · undo history', () => {
  const UNDO_KEY = 'z';

  function undo(content: HTMLElement): void {
    fireEvent.keyDown(content, { key: UNDO_KEY, ...modifierKey() });
  }

  it('reverses ordinary editing', async () => {
    const { ref, content } = await mountEditor();
    const handle = handleOf(ref);
    handle.setText('base');
    handle.insertText(' more');
    expect(handle.getText()).toBe('base more');
    undo(content);
    expect(handle.getText()).toBe('base');
  });

  it('cannot resurrect a message that was cleared on send', async () => {
    const { ref, content } = await mountEditor();
    const handle = handleOf(ref);
    handle.setText('sent message');
    handle.insertText('!');
    handle.clear();
    undo(content);
    expect(handle.getText()).toBe('');
  });

  it('cannot reach back across a conversation switch', async () => {
    const { ref, content } = await mountEditor();
    const handle = handleOf(ref);
    handle.setText('draft from the previous conversation');
    handle.setText('draft from this conversation');
    undo(content);
    expect(handle.getText()).toBe('draft from this conversation');
  });
});

describe('ComposerEditor · rendering contract', () => {
  it('carries the accessibility and QA attributes the textarea had', async () => {
    const describedBy = 'composer-counter';
    const { content } = await mountEditor({ ariaDescribedBy: describedBy });
    expect(content.getAttribute('role')).toBe('textbox');
    expect(content.getAttribute('aria-multiline')).toBe('true');
    expect(content.getAttribute('aria-label')).toBe(ARIA_LABEL);
    expect(content.getAttribute('aria-describedby')).toBe(describedBy);
    expect(content.getAttribute('dir')).toBe('auto');
  });

  it('shows the placeholder overlay only while the document is empty', async () => {
    const { ref, view } = await mountEditor({ placeholder: PLACEHOLDER });
    const placeholder = () => view.container.querySelector(`.${COMPOSER_EDITOR_PLACEHOLDER_CLASS}`);
    expect(placeholder()?.textContent).toBe(PLACEHOLDER);
    handleOf(ref).setText('typing');
    await waitFor(() => expect(placeholder()).toBeNull());
    handleOf(ref).clear();
    await waitFor(() => expect(placeholder()).not.toBeNull());
  });

  it('turns editing off when disabled and back on when it is lifted', async () => {
    const ref = createRef<ComposerEditorHandle>();
    const view = render(<ComposerEditor ref={ref} ariaLabel={ARIA_LABEL} disabled />);
    await waitFor(() => expect(ref.current).not.toBeNull());
    const content = () => view.container.querySelector(`[${COMPOSER_EDITOR_ATTRIBUTE}]`);
    await waitFor(() => expect(content()?.getAttribute('contenteditable')).toBe('false'));
    view.rerender(<ComposerEditor ref={ref} ariaLabel={ARIA_LABEL} disabled={false} />);
    await waitFor(() => expect(content()?.getAttribute('contenteditable')).toBe('true'));
  });
});
