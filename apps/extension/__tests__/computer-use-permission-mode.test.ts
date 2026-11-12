/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildComputerUsePanel } from '../src/features/side-panel/computerUsePanel';
import { ASK_BEFORE_ACTING_KEY } from '../src/features/computer-use/askBeforeActing';
import catalog from '../_locales/en/messages.json';

const messages = catalog as Record<string, { message: string }>;
const text = (key: string): string => messages[key]!.message;

const storage = vi.hoisted(() => ({
  values: {} as Record<string, unknown>,
  set: vi.fn(),
  listeners: [] as Array<(changes: Record<string, { newValue?: unknown }>, area: string) => void>,
}));

function stubChrome(): void {
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      runtime: {
        lastError: undefined,
        sendMessage: vi.fn(),
        getURL: (path: string) => `chrome-extension://test/${path}`,
      },
      i18n: {
        getMessage: (key: string) => messages[key]?.message ?? '',
        getUILanguage: () => 'en',
      },
      storage: {
        local: {
          get: vi.fn((key: string, callback?: (items: Record<string, unknown>) => void) => {
            callback?.(key in storage.values ? { [key]: storage.values[key] } : {});
          }),
          set: storage.set,
        },
        onChanged: {
          addListener: (listener: (typeof storage.listeners)[number]) =>
            storage.listeners.push(listener),
        },
      },
    },
  });
}

function control(): { select: HTMLSelectElement; label: HTMLElement } {
  const api = buildComputerUsePanel();
  const select = api.panelEl.querySelector<HTMLSelectElement>('#sp-cu-mode-select')!;
  return { select, label: select.closest('label') as HTMLElement };
}

beforeEach(() => {
  storage.values = {};
  storage.listeners.length = 0;
  storage.set.mockReset().mockResolvedValue(undefined);
  stubChrome();
});

describe('the Computer use tab shows the real permission mode', () => {
  it('shows Full access, with its own description, when that is the stored mode', () => {
    storage.values[ASK_BEFORE_ACTING_KEY] = false;
    const { select, label } = control();
    expect(select.value).toBe('full');
    expect(label.title).toBe(text('spAutonomyFullAccessTooltip'));
    expect(label.title).not.toBe(text('spAutonomyAutoTooltip'));
    expect(storage.set).not.toHaveBeenCalled();
  });

  it('shows Ask first and Auto for their stored values, and Auto when nothing is stored', () => {
    storage.values[ASK_BEFORE_ACTING_KEY] = true;
    expect(control().select.value).toBe('ask');
    storage.values[ASK_BEFORE_ACTING_KEY] = 'auto';
    expect(control().select.value).toBe('auto');
    delete storage.values[ASK_BEFORE_ACTING_KEY];
    expect(control().select.value).toBe('auto');
  });

  it('writes only the mode the user picks, so Full access is never moved to Auto by a toggle', async () => {
    storage.values[ASK_BEFORE_ACTING_KEY] = false;
    const { select } = control();
    select.value = 'ask';
    select.dispatchEvent(new Event('change'));
    await vi.waitFor(() =>
      expect(storage.set).toHaveBeenCalledWith({ [ASK_BEFORE_ACTING_KEY]: true }),
    );
    select.value = 'full';
    select.dispatchEvent(new Event('change'));
    await vi.waitFor(() =>
      expect(storage.set).toHaveBeenLastCalledWith({ [ASK_BEFORE_ACTING_KEY]: false }),
    );
    expect(storage.set).not.toHaveBeenCalledWith({ [ASK_BEFORE_ACTING_KEY]: 'auto' });
  });

  it('follows a change made from the composer chip or Options', () => {
    const { select, label } = control();
    for (const listener of storage.listeners)
      listener({ [ASK_BEFORE_ACTING_KEY]: { newValue: false } }, 'local');
    expect(select.value).toBe('full');
    expect(label.title).toBe(text('spAutonomyFullAccessTooltip'));
  });
});
