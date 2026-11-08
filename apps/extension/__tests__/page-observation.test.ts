import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { capturePageObservation } from '../src/features/content/pageObservation';
import { readTabObservation } from '../src/features/side-panel/pageObservation';
import { MAX_PAGE_TEXT_CHARACTERS } from '../src/features/content/in-page-panel/pageActions';
import { watchPasswordFields } from '../src/features/content/pageElements';

beforeEach(() => {
  vi.stubGlobal('CSS', { escape: (value: string) => value });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 10,
    height: 10,
  } as DOMRect);
  Object.defineProperty(HTMLElement.prototype, 'innerText', {
    configurable: true,
    get(this: HTMLElement) {
      return this.textContent ?? '';
    },
  });
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, 'innerText');
});

describe('live page observation', () => {
  it('reads current values, selections and checked state without changing the form', () => {
    document.body.innerHTML = `<label>Customer name<input id="customer"></label>
      <label>Instructions<textarea id="instructions"></textarea></label>
      <label>Size<select id="size"><option>Small</option><option>Medium</option></select></label>
      <label><input id="onion" type="checkbox">Onion</label>
      <button type="submit">Submit</button>`;
    (document.getElementById('customer') as HTMLInputElement).value = 'Browser Context Check K7M4';
    (document.getElementById('instructions') as HTMLTextAreaElement).value = 'Blue lantern 5831';
    (document.getElementById('size') as HTMLSelectElement).value = 'Medium';
    (document.getElementById('onion') as HTMLInputElement).checked = true;
    const listener = vi.fn();
    document.body.addEventListener('input', listener);
    const captured = capturePageObservation(location.href);
    expect(captured.success).toBe(true);
    expect(captured.text).toContain('Browser Context Check K7M4');
    expect(captured.text).toContain('Blue lantern 5831');
    expect(captured.text).toContain('"selected":["Medium"]');
    expect(captured.text).toContain('"checked":true');
    expect(listener).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.body);
  });

  it('excludes passwords, revealed passwords, payment fields, hidden fields and file paths', async () => {
    document.body.innerHTML = `<input id="revealed" type="password" value="HIDDEN_PASSWORD">
      <input id="cc" autocomplete="cc-number" value="HIDDEN_PAYMENT">
      <textarea name="password">HIDDEN_TEXTAREA</textarea>
      <input type="hidden" value="HIDDEN_TOKEN"><input type="file">
      <div style="display:none"><input value="HIDDEN_PARENT"></div>
      <label>City<input value="Boston"></label>`;
    watchPasswordFields();
    document.getElementById('revealed')!.setAttribute('type', 'text');
    await Promise.resolve();
    const captured = capturePageObservation(location.href);
    expect(captured.text).toContain('Boston');
    expect(captured.text).not.toContain('HIDDEN_');
    expect(captured.text).not.toContain('"type":"file"');
  });

  it('redacts secrets and bounds oversized form data', () => {
    document.body.innerHTML = '<label>Notes<textarea id="note"></textarea></label>';
    (document.getElementById('note') as HTMLTextAreaElement).value =
      `sk-ant-${'A'.repeat(60)} ${'x'.repeat(MAX_PAGE_TEXT_CHARACTERS * 2)}`;
    const result = capturePageObservation(location.href);
    expect(result.text?.length).toBeLessThanOrEqual(MAX_PAGE_TEXT_CHARACTERS + 1);
    expect(result.text).not.toContain('sk-ant-');
    expect(result.truncated).toBe(true);
  });

  it('refuses an observation for a different source URL', () => {
    expect(capturePageObservation('https://example.com')).toMatchObject({ success: false });
  });
});

describe('document-bound observation transport', () => {
  function harness() {
    const executeScript = vi
      .fn()
      .mockResolvedValue([{ documentId: 'doc-1', result: 'https://example.com/' }]);
    const sendMessage = vi
      .fn()
      .mockResolvedValue({ success: true, text: 'Current state', truncated: false });
    vi.stubGlobal('chrome', { scripting: { executeScript }, tabs: { sendMessage } });
    return { executeScript, sendMessage };
  }

  it('addresses the native document ID and verifies it after reading', async () => {
    const h = harness();
    await expect(readTabObservation(4, 'https://example.com/')).resolves.toEqual({
      text: 'Current state',
      truncated: false,
      documentId: 'doc-1',
    });
    expect(h.sendMessage).toHaveBeenCalledWith(
      4,
      { type: 'GET_PAGE_OBSERVATION', pageUrl: 'https://example.com/' },
      { documentId: 'doc-1' },
    );
    expect(h.executeScript).toHaveBeenCalledTimes(2);
  });

  it('injects the packaged receiver only when it is missing, bound to the same document', async () => {
    const h = harness();
    h.sendMessage.mockRejectedValueOnce(
      new Error('Could not establish connection. Receiving end does not exist.'),
    );
    await readTabObservation(4, 'https://example.com/');
    expect(h.executeScript).toHaveBeenCalledWith({
      target: { tabId: 4, documentIds: ['doc-1'] },
      files: ['src/content.js'],
    });
    expect(h.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('does not retry a permission rejection as a missing receiver', async () => {
    const h = harness();
    h.sendMessage.mockRejectedValue(new Error('Host permission denied'));
    await expect(readTabObservation(4, 'https://example.com/')).rejects.toThrow('Host permission');
    expect(h.executeScript).toHaveBeenCalledTimes(1);
  });

  it('rejects same-address document replacement after capture', async () => {
    const h = harness();
    h.executeScript
      .mockResolvedValueOnce([{ documentId: 'doc-1', result: 'https://example.com/' }])
      .mockResolvedValueOnce([{ documentId: 'doc-2', result: 'https://example.com/' }]);
    await expect(readTabObservation(4, 'https://example.com/')).rejects.toThrow('page changed');
  });

  it('rejects a changed source before sending any read request', async () => {
    const h = harness();
    await expect(readTabObservation(4, 'https://different.example/')).rejects.toThrow(
      'page changed',
    );
    expect(h.sendMessage).not.toHaveBeenCalled();
  });
});
