// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import catalog from '../_locales/en/messages.json';
import { buildPhoneSheet } from '../src/features/side-panel/phoneSheet';

type Entry = { message: string };
const message = (key: string): string => (catalog as Record<string, Entry>)[key]?.message ?? '';

beforeEach(() => {
  document.body.replaceChildren();
  vi.stubGlobal('chrome', { i18n: { getMessage: message } });
});

const LINK = 'https://agiworkforce.com/open/chat/7d1f4c1e-9f0b-4a51-b0f4-1f6a2b3c4d5e';

function setup(copy = vi.fn(async () => undefined)) {
  const sheet = buildPhoneSheet({ copy });
  document.body.appendChild(sheet.element);
  const trigger = document.createElement('button');
  document.body.appendChild(trigger);
  sheet.open(LINK, trigger);
  return { sheet, copy, trigger };
}

const copyButton = () => document.querySelector<HTMLButtonElement>('.sp-phone-copy')!;

describe('continue on phone sheet', () => {
  it('draws a code for the chat link and shows the link itself', async () => {
    setup();
    const code = document.querySelector<HTMLImageElement>('.sp-phone-code')!;
    await vi.waitFor(() => expect(code.hidden).toBe(false));
    expect(code.src.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    const svg = decodeURIComponent(code.src.slice(code.src.indexOf(',') + 1));
    expect(svg).toContain('<svg');
    expect(svg).toContain('fill="#ffffff"');
    expect(code.alt).toBe(message('spPhoneCodeAlt'));
    expect(document.querySelector('.sp-phone-link')?.textContent).toBe(LINK);
  });

  it('copies the link and says so', async () => {
    const { copy } = setup();
    copyButton().click();
    expect(copy).toHaveBeenCalledWith(LINK);
    await vi.waitFor(() =>
      expect(document.querySelector('#sp-phone [role="status"]')?.textContent).toBe(
        message('spPhoneCopied'),
      ),
    );
  });

  it('tells the person when copying fails', async () => {
    setup(vi.fn(async () => Promise.reject(new Error('denied'))));
    copyButton().click();
    await vi.waitFor(() =>
      expect(document.querySelector('#sp-phone [role="status"]')?.textContent).toBe(
        message('spPhoneCopyFailed'),
      ),
    );
  });

  it('closes on Escape and returns focus to the menu button', () => {
    const { trigger } = setup();
    const sheet = document.querySelector<HTMLElement>('#sp-phone')!;
    expect(sheet.hidden).toBe(false);
    sheet.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(sheet.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });
});
