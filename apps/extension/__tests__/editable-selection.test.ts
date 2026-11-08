import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyEditableSelection,
  captureEditableSelection,
  initializeEditableSelection,
  undoEditableSelection,
} from '../src/features/content/editableSelection';
import { watchPasswordFields } from '../src/features/content/pageElements';

const URL = 'https://example.com/editor';
const OWNER = { accountId: 'account-a', authIncarnation: 'session-a' };

beforeEach(() => {
  vi.stubGlobal('location', { href: URL });
  vi.stubGlobal('CSS', { escape: (value: string) => value });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 200,
    height: 50,
  } as DOMRect);
  Object.defineProperty(HTMLElement.prototype, 'innerText', {
    configurable: true,
    get(this: HTMLElement) {
      return this.textContent ?? '';
    },
  });
  document.body.innerHTML =
    '<label>Message<textarea id="message">Before rough words after.</textarea></label><input id="other">';
  initializeEditableSelection();
  Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => false) });
});

afterEach(() => {
  document.body.replaceChildren();
  window.getSelection()?.removeAllRanges();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, 'innerText');
  Reflect.deleteProperty(document, 'execCommand');
  Reflect.deleteProperty(document, 'queryCommandEnabled');
});

function capture() {
  const field = document.getElementById('message') as HTMLTextAreaElement;
  field.focus();
  const start = field.value.indexOf('rough words');
  field.setSelectionRange(start, start + 'rough words'.length);
  const selected = captureEditableSelection(URL, 'rough words', OWNER);
  return { field, id: selected.selection.id, selected };
}

describe('bound native selection editing', () => {
  it('captures only selected text and a label, without sending surrounding text or writing', () => {
    const { selected, field } = capture();
    expect(selected.selection.selectedText).toBe('rough words');
    expect(selected.selection.label).toBe('Message');
    expect(JSON.stringify(selected)).not.toContain('Before');
    expect(field.value).toBe('Before rough words after.');
  });

  it('replaces only the selected range and restores the original on Undo', async () => {
    const { id, field } = capture();
    await expect(applyEditableSelection(id, URL, 'clear wording', OWNER)).resolves.toMatchObject({
      success: true,
      applied: true,
      verified: true,
      undoAvailable: true,
    });
    expect(field.value).toBe('Before clear wording after.');
    await expect(undoEditableSelection(id, URL, OWNER)).resolves.toMatchObject({ success: true });
    expect(field.value).toBe('Before rough words after.');
    expect(field.value.slice(field.selectionStart, field.selectionEnd)).toBe('rough words');
  });

  it('does not insert the same draft twice', async () => {
    const { id, field } = capture();
    await applyEditableSelection(id, URL, 'clear wording', OWNER);
    await expect(applyEditableSelection(id, URL, 'again', OWNER)).rejects.toThrow('field changed');
    expect(field.value).toBe('Before clear wording after.');
  });

  it('restores native-command insertions through the editing command rather than a property reset', async () => {
    const { id, field } = capture();
    const command = vi.fn((_name: string, _showUi: boolean, value: string) => {
      field.setRangeText(value, field.selectionStart, field.selectionEnd, 'end');
      field.dispatchEvent(new InputEvent('input', { bubbles: true }));
      return true;
    });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: command });
    await applyEditableSelection(id, URL, 'clear wording', OWNER);
    await undoEditableSelection(id, URL, OWNER);
    expect(command).toHaveBeenLastCalledWith('insertText', false, 'Before rough words after.');
    expect(field.value).toBe('Before rough words after.');
  });

  it('preserves edits made while the model is drafting', async () => {
    const { id, field } = capture();
    field.value = 'User changed the field';
    await expect(applyEditableSelection(id, URL, 'clear wording', OWNER)).rejects.toThrow(
      'field changed',
    );
    expect(field.value).toBe('User changed the field');
  });

  it('rejects a replaced element even if its text and selector are identical', async () => {
    const { id, field } = capture();
    field.replaceWith(field.cloneNode(true));
    await expect(applyEditableSelection(id, URL, 'clear wording', OWNER)).rejects.toThrow();
    expect((document.getElementById('message') as HTMLTextAreaElement).value).toBe(
      'Before rough words after.',
    );
  });

  it('does not write when a focus handler redirects focus to another field', async () => {
    const { id, field } = capture();
    const other = document.getElementById('other') as HTMLInputElement;
    other.focus();
    field.addEventListener('focus', () => other.focus());
    await expect(applyEditableSelection(id, URL, 'clear wording', OWNER)).rejects.toThrow(
      'focused',
    );
    expect(other.value).toBe('');
    expect(field.value).toBe('Before rough words after.');
  });

  it.each([
    { accountId: 'account-b', authIncarnation: 'session-a' },
    { accountId: 'account-a', authIncarnation: 'session-b' },
  ])('refuses another account or sign-in session', async (changed) => {
    const { id, field } = capture();
    await expect(applyEditableSelection(id, URL, 'clear wording', changed)).rejects.toThrow(
      'expired',
    );
    expect(field.value).toBe('Before rough words after.');
  });

  it('refuses source navigation and a superseded selection', async () => {
    const old = capture();
    const current = capture();
    await expect(applyEditableSelection(old.id, URL, 'clear wording', OWNER)).rejects.toThrow(
      'expired',
    );
    await expect(
      applyEditableSelection(current.id, `${URL}?changed`, 'clear wording', OWNER),
    ).rejects.toThrow('expired');
  });

  it('does not share passwords or revealed passwords', async () => {
    document.body.innerHTML = '<input id="field" type="password" value="rough words">';
    watchPasswordFields();
    const field = document.getElementById('field') as HTMLInputElement;
    field.type = 'text';
    await Promise.resolve();
    field.focus();
    field.select();
    expect(() => captureEditableSelection(URL, 'rough words', OWNER)).toThrow(
      'cannot be rewritten',
    );
  });

  it('refuses secret-looking selections and drafts', async () => {
    const { id } = capture();
    const secret = `sk-ant-${'A'.repeat(60)}`;
    await expect(applyEditableSelection(id, URL, secret, OWNER)).rejects.toThrow(
      'cannot be inserted',
    );
    expect(() => captureEditableSelection(URL, secret, OWNER)).toThrow('cannot be shared');
  });

  it('refuses a draft that exceeds the native field limit before writing', async () => {
    const { id, field } = capture();
    field.maxLength = field.value.length;
    await expect(
      applyEditableSelection(id, URL, 'a much longer replacement than before', OWNER),
    ).rejects.toThrow('field’s limits');
    expect(field.value).toBe('Before rough words after.');
  });

  it('reports a site-altered insertion instead of claiming the requested draft was retained', async () => {
    const { id, field } = capture();
    field.addEventListener('input', () => {
      field.value = 'Site transformed the draft';
    });
    await expect(applyEditableSelection(id, URL, 'clear wording', OWNER)).resolves.toMatchObject({
      success: false,
      applied: true,
      verified: false,
      undoAvailable: true,
    });
  });

  it('does not overwrite later user edits when Undo is requested', async () => {
    const { id, field } = capture();
    await applyEditableSelection(id, URL, 'clear wording', OWNER);
    field.value += ' More user text';
    await expect(undoEditableSelection(id, URL, OWNER)).rejects.toThrow('changed after insertion');
    expect(field.value).toContain('More user text');
  });
});

describe('contenteditable selections', () => {
  it('uses a native editing command, verifies the result and guards editor Undo', async () => {
    document.body.innerHTML =
      '<div id="editor" contenteditable="true" role="textbox" aria-label="Draft">Before rough words after.</div>';
    const editor = document.getElementById('editor')!;
    editor.focus();
    const text = editor.firstChild!;
    const range = document.createRange();
    range.setStart(text, 7);
    range.setEnd(text, 18);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    expect(window.getSelection()!.toString()).toBe('rough words');
    const originalHtml = editor.innerHTML;
    Object.defineProperty(document, 'queryCommandEnabled', {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn((command: string, _showUi: boolean, value: string) => {
        if (command === 'undo') editor.innerHTML = originalHtml;
        else {
          const current = window.getSelection()!.getRangeAt(0);
          current.deleteContents();
          current.insertNode(document.createTextNode(value));
        }
        editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
        return true;
      }),
    });
    const captured = captureEditableSelection(URL, 'rough words', OWNER);
    await expect(
      applyEditableSelection(captured.selection.id, URL, 'clear wording', OWNER),
    ).resolves.toMatchObject({ success: true, undoAvailable: true });
    expect(editor.textContent).toBe('Before clear wording after.');
    await expect(undoEditableSelection(captured.selection.id, URL, OWNER)).resolves.toMatchObject({
      success: true,
    });
    expect(editor.innerHTML).toBe(originalHtml);
  });
});
