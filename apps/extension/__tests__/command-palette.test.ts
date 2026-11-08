// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import catalog from '../_locales/en/messages.json';
import {
  buildCommandPalette,
  type PaletteCommand,
} from '../src/features/side-panel/commandPalette';

beforeEach(() => {
  document.body.replaceChildren();
  vi.stubGlobal('chrome', {
    i18n: {
      getMessage: (key: string) =>
        (catalog as Record<string, { message: string }>)[key]?.message ?? '',
    },
  });
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

function command(label: string, run = vi.fn()): PaletteCommand {
  return { id: label, label, section: 'chats', run };
}

function setup(load: () => Promise<PaletteCommand[]>) {
  const trigger = document.createElement('button');
  document.body.appendChild(trigger);
  const palette = buildCommandPalette(load);
  palette.open(trigger);
  return {
    palette,
    trigger,
    input: document.querySelector<HTMLInputElement>('.sp-palette-input')!,
    backdrop: document.querySelector<HTMLElement>('.sp-palette-backdrop')!,
  };
}

describe('command palette lifetime', () => {
  it('clears private titles and search text on close while restoring focus', async () => {
    const { palette, trigger, input, backdrop } = setup(async () => [command('Private title')]);
    await vi.waitFor(() => expect(backdrop.textContent).toContain('Private title'));
    input.value = 'Private';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    palette.close();
    expect(backdrop.hidden).toBe(true);
    expect(backdrop.textContent).not.toContain('Private title');
    expect(backdrop.querySelectorAll('[role="option"]')).toHaveLength(0);
    expect(input.value).toBe('');
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('discards a closed view’s delayed chat list', async () => {
    let finish!: (commands: PaletteCommand[]) => void;
    const { palette, backdrop } = setup(() => new Promise((resolve) => (finish = resolve)));
    palette.close();
    finish([command('Retired private title')]);
    await Promise.resolve();
    expect(backdrop.hidden).toBe(true);
    expect(backdrop.querySelectorAll('[role="option"]')).toHaveLength(0);
  });

  it('keeps a reopened view’s result when the retired load finishes later', async () => {
    let finish!: (commands: PaletteCommand[]) => void;
    const load = vi
      .fn<() => Promise<PaletteCommand[]>>()
      .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
      .mockResolvedValueOnce([command('Current title')]);
    const { palette, trigger, backdrop } = setup(load);
    palette.close();
    palette.open(trigger);
    await vi.waitFor(() => expect(backdrop.textContent).toContain('Current title'));
    finish([command('Retired private title')]);
    await Promise.resolve();
    expect(backdrop.textContent).toContain('Current title');
    expect(backdrop.textContent).not.toContain('Retired private title');
  });

  it('executes the selected command once after clearing the palette', async () => {
    const run = vi.fn();
    const { input, backdrop } = setup(async () => [command('Other'), command('Selected', run)]);
    await vi.waitFor(() => expect(backdrop.querySelectorAll('[role="option"]')).toHaveLength(2));
    input.value = 'Selected';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(run).toHaveBeenCalledOnce();
    expect(backdrop.hidden).toBe(true);
    expect(backdrop.querySelectorAll('[role="option"]')).toHaveLength(0);
  });
});
