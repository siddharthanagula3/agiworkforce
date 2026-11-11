// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createShortcutsSection } from '../src/features/options/shortcuts-section';

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await new Promise((resolveTimer) => setTimeout(resolveTimer, 0));
};

beforeEach(() => {
  vi.stubGlobal('chrome', {
    i18n: { getMessage: (key: string) => key, getUILanguage: () => 'en' },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function harness() {
  const actions = [{ kind: 'click' }];
  let releaseRead: (() => void) | null = null;
  let holdRead = false;
  const send = vi.fn(async (message: Record<string, unknown>) => {
    if (message['type'] === 'LIST_SHORTCUTS') return { success: true, shortcuts: [] };
    if (message['type'] === 'GET_RECORDED_ACTIONS' && holdRead) {
      await new Promise<void>((resolveRead) => {
        releaseRead = resolveRead;
      });
      return { success: true, actions };
    }
    if (message['type'] === 'GET_RECORDED_ACTIONS') return { success: true, actions };
    return { success: true };
  });
  const section = createShortcutsSection({
    send: send as never,
    queryTabs: async () => [{ id: 7, url: 'https://shop.example.com/cart', lastAccessed: 5 }],
  });
  document.body.appendChild(section.element);
  const form = section.element.querySelector<HTMLFormElement>('#opt-record-save')!;
  const recordButton = section.element.querySelector<HTMLButtonElement>('#opt-record-btn')!;
  const nameInput = section.element.querySelector<HTMLInputElement>('#opt-record-name')!;
  const buttons = form.querySelectorAll<HTMLButtonElement>('button');
  const saveButton = buttons[0]!;
  const discardButton = buttons[1]!;
  const savesSent = (): number =>
    send.mock.calls.filter(([message]) => message['type'] === 'SAVE_SHORTCUT').length;
  const recordAndStop = async (): Promise<void> => {
    recordButton.click();
    await flush();
    recordButton.click();
    await flush();
  };
  const submit = async (name: string): Promise<void> => {
    nameInput.value = name;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
  };
  return {
    section,
    send,
    form,
    recordButton,
    saveButton,
    discardButton,
    savesSent,
    recordAndStop,
    submit,
    holdNextRead: () => {
      holdRead = true;
    },
    resolveHeldRead: async () => {
      holdRead = false;
      (releaseRead as (() => void) | null)?.();
      await flush();
    },
  };
}

describe('recording draft withdrawn while its save read is pending', () => {
  it('sends no save when Discard is pressed before the action read returns', async () => {
    const h = harness();
    await h.recordAndStop();
    h.holdNextRead();
    await h.submit('Cart check');
    expect(h.discardButton.disabled).toBe(false);
    h.discardButton.click();
    await h.resolveHeldRead();
    expect(h.savesSent()).toBe(0);
    expect(h.form.hidden).toBe(true);
    expect(h.section.element.textContent).not.toContain('optShortcutCreated');
  });

  it('does not let a withdrawn read settle a newer draft', async () => {
    const h = harness();
    await h.recordAndStop();
    h.holdNextRead();
    await h.submit('Old draft');
    h.discardButton.click();
    await h.recordAndStop();
    await h.resolveHeldRead();
    expect(h.savesSent()).toBe(0);
    expect(h.form.hidden).toBe(false);
    expect(h.saveButton.disabled).toBe(false);
  });

  it('keeps a committed save intact and locks Discard once the save is sent', async () => {
    const h = harness();
    await h.recordAndStop();
    let releaseSave: (() => void) | null = null;
    const original = h.send.getMockImplementation()!;
    h.send.mockImplementation(async (message: Record<string, unknown>) => {
      if (message['type'] === 'SAVE_SHORTCUT') {
        await new Promise<void>((resolveSave) => {
          releaseSave = resolveSave;
        });
        return { success: true };
      }
      return original(message);
    });
    await h.submit('Cart check');
    expect(h.savesSent()).toBe(1);
    expect(h.discardButton.disabled).toBe(true);
    (releaseSave as (() => void) | null)?.();
    await flush();
    expect(h.form.hidden).toBe(true);
    expect(h.discardButton.disabled).toBe(false);
  });

  it('still saves exactly once when nothing is withdrawn', async () => {
    const h = harness();
    await h.recordAndStop();
    await h.submit('Cart check');
    expect(h.savesSent()).toBe(1);
    expect(h.send).toHaveBeenCalledWith({
      type: 'SAVE_SHORTCUT',
      name: 'Cart check',
      actions: [{ kind: 'click' }],
      startUrl: 'https://shop.example.com',
    });
  });
});
