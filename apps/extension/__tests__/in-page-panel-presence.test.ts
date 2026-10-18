/**
 * The floating launcher must not sit on the page while the real side panel is open.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from 'vitest';

type Listener = (message: unknown, sender: { id?: string; tab?: unknown }) => void;

const chromeMock = vi.hoisted(() => {
  const mock = {
    listeners: [] as Array<(message: unknown, sender: { id?: string; tab?: unknown }) => void>,
    open: true,
    storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) } },
    runtime: {
      id: 'ext-id',
      onMessage: {
        addListener: vi.fn((listener: Listener) => {
          mock.listeners.push(listener);
        }),
      },
      sendMessage: vi.fn(async (message: { type?: string }) =>
        message.type === 'GET_SIDE_PANEL_OPEN' ? { success: true, open: mock.open } : undefined,
      ),
    },
  };
  (globalThis as Record<string, unknown>).chrome = mock;
  return mock;
});

import { setupInPagePanel } from '../src/inPagePanel/setup';
import { SIDE_PANEL_PRESENCE_MESSAGE } from '../src/features/side-panel/panelPresence';

const launcher = (): HTMLElement => document.querySelector<HTMLElement>('[data-agi-launcher]')!;

describe('in-page launcher while the real side panel is open', () => {
  it('hides when the panel is already open, shows when it closes and hides again when it reopens', async () => {
    await setupInPagePanel(true);
    await vi.waitFor(() => expect(launcher().style.getPropertyValue('display')).toBe('none'));

    const deliver = (open: boolean, sender: { id?: string; tab?: unknown }): void => {
      for (const listener of chromeMock.listeners)
        listener({ type: SIDE_PANEL_PRESENCE_MESSAGE, open }, sender);
    };

    deliver(false, { id: 'ext-id' });
    expect(launcher().style.getPropertyValue('display')).toBe('block');

    deliver(true, { id: 'ext-id' });
    expect(launcher().style.getPropertyValue('display')).toBe('none');
  });

  it('ignores presence messages that do not come from the extension background', async () => {
    const before = launcher().style.getPropertyValue('display');
    for (const listener of chromeMock.listeners) {
      listener({ type: SIDE_PANEL_PRESENCE_MESSAGE, open: false }, { id: 'someone-else' });
      listener({ type: SIDE_PANEL_PRESENCE_MESSAGE, open: false }, { id: 'ext-id', tab: {} });
    }
    expect(launcher().style.getPropertyValue('display')).toBe(before);
  });
});
