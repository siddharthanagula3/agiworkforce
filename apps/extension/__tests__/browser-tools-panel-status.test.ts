/**
 * The Page view's capture banner. A watch ends by itself when the tab leaves
 * the page it was approved for, so the states that matter are the three the
 * user can land in without touching the toggle.
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest';

const ORIGIN = 'https://site.example';

const { buildBrowserToolsPanel } = await import('../src/features/side-panel/browserToolsPanel');

let watching = true;

const send = async <T>(message: Record<string, unknown>): Promise<T | undefined> => {
  switch (message['type']) {
    case 'LIST_DOWNLOADS':
      return { success: true, downloads: [] } as T;
    case 'READ_PAGE_CONSOLE':
      return { success: true, watching, origin: ORIGIN, console: [] } as T;
    case 'READ_PAGE_NETWORK':
      return { success: true, watching, origin: ORIGIN, network: [] } as T;
    default:
      return undefined;
  }
};

function statusOf(panel: { panelEl: HTMLElement }): string {
  return panel.panelEl.querySelector('#sp-bt-watch-status')?.textContent ?? '';
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

beforeEach(() => {
  watching = true;
});

describe('page capture banner', () => {
  it('names the origin it is capturing while the watch is live', async () => {
    const panel = buildBrowserToolsPanel(send);
    panel.setActive(true);
    await settle();
    expect(statusOf(panel)).toContain(`Capturing console and network on ${ORIGIN}`);
    panel.setActive(false);
  });

  it('says why capture stopped when the tab leaves the page it was watching', async () => {
    const panel = buildBrowserToolsPanel(send);
    panel.setActive(true);
    await settle();

    watching = false;
    panel.setActive(false);
    panel.setActive(true);
    await settle();

    expect(statusOf(panel)).toContain('Capture stopped because this tab left the page');
    expect(statusOf(panel)).toContain(ORIGIN);
    expect(panel.panelEl.querySelector('#sp-bt-watch')?.textContent).toBe('Watch page');
    panel.setActive(false);
  });

  it('does not claim a stop the user never started', async () => {
    watching = false;
    const panel = buildBrowserToolsPanel(send);
    panel.setActive(true);
    await settle();
    expect(statusOf(panel)).toContain(`Not capturing on ${ORIGIN}`);
    expect(statusOf(panel)).not.toContain('Capture stopped');
    panel.setActive(false);
  });
});
