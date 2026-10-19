import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DICTATION_SESSION_LIMIT_MS,
  createDictationElsewhere,
  dictationText,
  type DictationApp,
} from '../dictationElsewhere';

const NOTES: DictationApp = {
  name: 'Notes',
  pid: 4242,
  bundleId: 'com.apple.Notes',
  secureInput: false,
};
const OWN_PID = 100;
const BAR_ID = 7;

let front: DictationApp | null;
let clock: number;
const bar = { contentsId: BAR_ID, toggle: vi.fn(), close: vi.fn() };
const deps = {
  frontApp: vi.fn(async () => front),
  openBar: vi.fn(() => bar),
  typeText: vi.fn(async (_text: string) => undefined),
  copyText: vi.fn(),
  notify: vi.fn(),
  ownPid: OWN_PID,
  now: () => clock,
};

beforeEach(() => {
  vi.clearAllMocks();
  front = NOTES;
  clock = 1_000;
});

async function listening() {
  const dictation = createDictationElsewhere(deps);
  expect(await dictation.handlePress()).toBe(true);
  return dictation;
}

describe('what a dictation may type', () => {
  it('turns every line break into a space so it can never press Return', () => {
    expect(dictationText('ls -la\nrm -rf ~\r\nok done')).toBe('ls -la rm -rf ~ ok done');
  });

  it('drops invisible and direction-changing characters', () => {
    expect(dictationText('pay ‮evil‬ to​ bob\u0007')).toBe('pay evil to bob');
  });

  it('refuses nothing, non-text and text past the limit', () => {
    expect(dictationText('  \n ')).toBeNull();
    expect(dictationText(42)).toBeNull();
    expect(dictationText('a'.repeat(10_001))).toBeNull();
  });
});

describe('a press of the dictation shortcut', () => {
  it('opens the bar over another app, and stops it on the next press', async () => {
    const dictation = await listening();
    expect(deps.openBar).toHaveBeenCalledTimes(1);

    expect(await dictation.handlePress()).toBe(true);
    expect(bar.toggle).toHaveBeenCalledTimes(1);
    expect(deps.openBar).toHaveBeenCalledTimes(1);
  });

  it('leaves a press over AGI Cloud itself, or with nothing readable in front, to the app', async () => {
    const dictation = createDictationElsewhere(deps);
    front = { name: 'AGI Cloud', pid: OWN_PID, bundleId: null, secureInput: false };
    expect(await dictation.handlePress()).toBe(false);
    front = null;
    expect(await dictation.handlePress()).toBe(false);
    expect(deps.openBar).not.toHaveBeenCalled();
  });
});

describe('typing what was dictated', () => {
  it('types into the app that was in front, once, and closes the bar', async () => {
    const dictation = await listening();

    expect(await dictation.finish(BAR_ID, 'hello\nthere')).toBe('typed');
    expect(deps.typeText).toHaveBeenCalledWith('hello there');
    expect(bar.close).toHaveBeenCalled();

    await expect(dictation.finish(BAR_ID, 'again')).rejects.toThrow('No dictation is waiting');
    expect(deps.typeText).toHaveBeenCalledTimes(1);
  });

  it('types nothing a page sends without a press, or from another window', async () => {
    const idle = createDictationElsewhere(deps);
    await expect(idle.finish(BAR_ID, 'rm -rf ~')).rejects.toThrow('No dictation is waiting');

    const dictation = await listening();
    await expect(dictation.finish(BAR_ID + 1, 'rm -rf ~')).rejects.toThrow(
      'No dictation is waiting',
    );
    expect(deps.typeText).not.toHaveBeenCalled();
    expect(dictation.isListening()).toBe(true);
  });

  it('copies instead of typing when another app has come to the front', async () => {
    const dictation = await listening();
    front = { name: 'Terminal', pid: 9, bundleId: 'com.apple.Terminal', secureInput: false };

    expect(await dictation.finish(BAR_ID, 'hello')).toBe('copied');
    expect(deps.typeText).not.toHaveBeenCalled();
    expect(deps.copyText).toHaveBeenCalledWith('hello');
    expect(deps.notify.mock.calls[0]?.[1]).toContain('Notes is no longer in front');
  });

  it('never types into a field macOS is guarding for a password', async () => {
    const dictation = await listening();
    front = { ...NOTES, secureInput: true };

    expect(await dictation.finish(BAR_ID, 'hunter2')).toBe('copied');
    expect(deps.typeText).not.toHaveBeenCalled();
  });

  it('never types into a system password or keychain prompt, even one that was in front', async () => {
    for (const bundleId of ['com.apple.SecurityAgent', 'com.apple.LocalAuthentication.UIAgent']) {
      vi.clearAllMocks();
      front = { name: 'Password prompt', pid: 77, bundleId, secureInput: false };
      const dictation = await listening();
      expect(await dictation.finish(BAR_ID, 'hunter2'), bundleId).toBe('copied');
      expect(deps.typeText).not.toHaveBeenCalled();
    }
  });

  it('never types into AGI Cloud itself, even if it came to the front', async () => {
    const dictation = await listening();
    front = { name: 'AGI Cloud', pid: OWN_PID, bundleId: null, secureInput: false };
    expect(await dictation.finish(BAR_ID, 'hello')).toBe('copied');
    expect(deps.typeText).not.toHaveBeenCalled();
  });

  it('copies a dictation that ran past the limit, and copies when typing fails', async () => {
    const slow = await listening();
    clock += DICTATION_SESSION_LIMIT_MS + 1;
    expect(await slow.finish(BAR_ID, 'late')).toBe('copied');

    clock = 1_000;
    const refused = await listening();
    deps.typeText.mockRejectedValueOnce(new Error('Accessibility is off'));
    expect(await refused.finish(BAR_ID, 'hello')).toBe('copied');
    expect(deps.copyText).toHaveBeenLastCalledWith('hello');
  });

  it('ends on cancel from its own bar only', async () => {
    const dictation = await listening();
    dictation.cancel(BAR_ID + 1);
    expect(dictation.isListening()).toBe(true);
    dictation.cancel(BAR_ID);
    expect(dictation.isListening()).toBe(false);
    expect(bar.close).toHaveBeenCalled();
  });
});
