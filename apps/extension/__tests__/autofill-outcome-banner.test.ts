import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildComputerUsePanel } from '../src/features/side-panel/computerUsePanel';

function stubChrome(): void {
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      runtime: { lastError: undefined, sendMessage: vi.fn() },
      storage: { local: { get: vi.fn(), set: vi.fn() } },
      tabs: { query: vi.fn() },
    },
  });
}

function banner(panel: HTMLElement) {
  const root = panel.querySelector('.sp-cu-banner') as HTMLElement | null;
  return {
    root,
    title: root?.querySelector('.sp-cu-banner-title')?.textContent ?? '',
    sub: root?.querySelector('.sp-cu-banner-sub')?.textContent ?? '',
    icon: root?.querySelector('.sp-cu-banner-icon')?.textContent ?? '',
    kind: root?.getAttribute('data-kind'),
    visible: root?.classList.contains('visible') ?? false,
  };
}

describe('autofill outcome banner', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    stubChrome();
  });

  it('ships no headline before an outcome exists', () => {
    const api = buildComputerUsePanel();
    const state = banner(api.panelEl);

    expect(state.visible).toBe(false);
    expect(state.title).toBe('');
    expect(state.icon).toBe('');
  });

  it('reports a completed autofill as success, not as a stall', () => {
    const api = buildComputerUsePanel();
    api.showHandoffBanner('No agent escalation needed.', 'success');

    const state = banner(api.panelEl);
    expect(state.visible).toBe(true);
    expect(state.kind).toBe('success');
    expect(state.title).toBe('Autofill complete');
    expect(state.title).not.toContain('stalled');
    expect(state.sub).toBe('No agent escalation needed.');
  });

  it('reports a failure as a failure', () => {
    const api = buildComputerUsePanel();
    api.showHandoffBanner('Autofill failed: no such tab', 'error');

    const state = banner(api.panelEl);
    expect(state.kind).toBe('error');
    expect(state.title).toBe('Autofill could not run');
    expect(state.title).not.toContain('stalled');
    expect(state.sub).toContain('no such tab');
  });

  it('still reports an escalation as a stall, and does so by default', () => {
    const api = buildComputerUsePanel();
    api.showHandoffBanner('Fast-path autofill stalled (2 trigger(s)).');

    const state = banner(api.panelEl);
    expect(state.kind).toBe('escalation');
    expect(state.title).toContain('switching to computer use');
  });

  it('does not leave a previous outcome behind when the next one differs', () => {
    const api = buildComputerUsePanel();

    api.showHandoffBanner('Fast-path autofill stalled.', 'escalation');
    expect(banner(api.panelEl).kind).toBe('escalation');

    api.showHandoffBanner('No agent escalation needed.', 'success');
    const state = banner(api.panelEl);
    expect(state.kind).toBe('success');
    expect(state.title).toBe('Autofill complete');
    expect(state.sub).not.toContain('stalled');
  });
});
