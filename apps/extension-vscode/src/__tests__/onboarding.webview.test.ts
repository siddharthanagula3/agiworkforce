/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getWebviewContent } from '../features/sidebar-webview/webviewContent';
import { vscodeApiStub } from './vscodeApiStub';

function renderOnboarding(): string {
  const webview = {
    cspSource: 'vscode-webview://mock',
    asWebviewUri: (uri: { toString(): string }) => ({
      toString: () => uri.toString().replace(/^file:/, 'https://mock'),
    }),
  };
  const extensionUri = {
    toString: () => 'file:///mock/extension',
    fsPath: '/mock/extension',
  };

  return getWebviewContent(
    webview as unknown as Parameters<typeof getWebviewContent>[0],
    extensionUri as unknown as Parameters<typeof getWebviewContent>[1],
    'test-nonce-base64url-32-chars-abcdef',
    'auto',
    'medium',
    true,
    false,
    'pro',
    true,
  );
}

function executeOnboarding() {
  const parsed = new DOMParser().parseFromString(renderOnboarding(), 'text/html');
  document.head.innerHTML = parsed.head.innerHTML;
  document.body.innerHTML = parsed.body.innerHTML;
  const postMessage = vi.fn();
  Object.defineProperty(globalThis, 'acquireVsCodeApi', {
    configurable: true,
    value: () => vscodeApiStub({ postMessage }),
  });
  const inlineScript = Array.from(parsed.querySelectorAll('script')).find((script) =>
    script.textContent?.includes('acquireVsCodeApi()'),
  );
  expect(inlineScript?.textContent).toBeTruthy();
  // llm-guardrail-allow: executes repository-owned webview JavaScript in jsdom
  new Function(inlineScript?.textContent ?? '')();
  return { postMessage };
}

function click(id: string): void {
  const element = document.getElementById(id);
  expect(element).not.toBeNull();
  element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function reportRuntime(status: string, cliMissing = false): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type: 'runtimeStatus', payload: { status, cliMissing } },
    }),
  );
}

describe('VS Code first-run onboarding', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'acquireVsCodeApi');
    vi.restoreAllMocks();
  });

  it('renders four keyboard-readable steps with Back disabled on step one', () => {
    executeOnboarding();

    const onboarding = document.getElementById('onboarding');
    const back = document.getElementById('onboardingBack') as HTMLButtonElement;
    expect(onboarding?.hidden).toBe(false);
    expect(onboarding?.getAttribute('aria-hidden')).toBe('false');
    expect(back.disabled).toBe(true);
    expect((document.querySelector('.input-area') as HTMLElement & { inert: boolean }).inert).toBe(
      true,
    );
    expect(document.getElementById('onboardingProgress')?.textContent).toBe('Setup · 1 of 4');
    expect(document.querySelector('[data-onboarding-step="0"]')?.hasAttribute('hidden')).toBe(
      false,
    );
    expect(document.querySelector('[data-onboarding-step="1"]')?.hasAttribute('hidden')).toBe(true);
  });

  it('gives every step one title and one sentence, with no card or disclosure list', () => {
    executeOnboarding();

    for (let step = 0; step < 4; step += 1) {
      const article = document.querySelector(`[data-onboarding-step="${step}"]`);
      expect(article?.querySelectorAll('h2')).toHaveLength(1);
      expect(article?.querySelectorAll('p.onboarding-lede')).toHaveLength(1);
      expect(article?.querySelector('.onboarding-card')).toBeNull();
      expect(article?.querySelector('.onboarding-disclosures')).toBeNull();
      if (step < 3) click('onboardingNext');
    }
  });

  it('names task handoff on step two without a second entry point to Cloud Tasks', () => {
    executeOnboarding();
    click('onboardingNext');

    expect(document.getElementById('onboardingProgress')?.textContent).toBe('Setup · 2 of 4');
    expect(document.body.textContent).toContain('appear in the Cloud Tasks view');
    expect(document.getElementById('onboardingTasks')).toBeNull();
  });

  it('places autonomy and the privacy links before completion', () => {
    const { postMessage } = executeOnboarding();
    click('onboardingNext');
    click('onboardingNext');
    click('onboardingNext');

    expect(document.getElementById('onboardingProgress')?.textContent).toBe('Setup · 4 of 4');
    expect(document.body.textContent).toContain(
      'The mode menu controls which actions need your approval',
    );
    expect(document.getElementById('onboardingBoundary')).toBeNull();

    click('onboardingPermissionDocs');
    click('onboardingPrivacySettings');
    expect(postMessage).toHaveBeenCalledWith({
      origin: 'chat',
      epoch: 0,
      type: 'openPermissionDocs',
    });
    expect(postMessage).toHaveBeenCalledWith({
      origin: 'chat',
      epoch: 0,
      type: 'openPrivacySettings',
    });
  });

  it('persists completion, hides the intro, and supports host-triggered replay', () => {
    const { postMessage } = executeOnboarding();
    click('onboardingSkip');

    expect(document.getElementById('onboarding')?.hidden).toBe(true);
    expect((document.querySelector('.input-area') as HTMLElement & { inert: boolean }).inert).toBe(
      false,
    );
    expect(postMessage).toHaveBeenCalledWith({
      origin: 'chat',
      epoch: 0,
      type: 'completeOnboarding',
    });

    window.dispatchEvent(new MessageEvent('message', { data: { type: 'showOnboarding' } }));
    expect(document.getElementById('onboarding')?.hidden).toBe(false);
    expect(document.getElementById('onboardingProgress')?.textContent).toBe('Setup · 1 of 4');

    window.dispatchEvent(new MessageEvent('message', { data: { type: 'hideOnboarding' } }));
    expect(document.getElementById('onboarding')?.hidden).toBe(true);
    expect((document.querySelector('.input-area') as HTMLElement & { inert: boolean }).inert).toBe(
      false,
    );
  });

  it.each([
    ['workspace-required', false, 'Open folder', 'openWorkspace'],
    ['workspace-untrusted', false, 'Manage trust', 'manageWorkspaceTrust'],
    ['unavailable', true, 'Install CLI', 'installCli'],
  ])(
    'focuses the actionable recovery control when skipping intro with %s',
    (state, cliMissing, label, message) => {
      const { postMessage } = executeOnboarding();
      reportRuntime(state, cliMissing);
      click('onboardingSkip');

      const recovery = document.getElementById('runtimeSettingsBtn');
      expect(recovery?.textContent).toBe(label);
      expect(document.activeElement).toBe(recovery);
      expect((document.getElementById('userInput') as HTMLTextAreaElement).disabled).toBe(true);
      expect(postMessage.mock.calls.some(([entry]) => entry.type === message)).toBe(false);
      click('runtimeSettingsBtn');
      expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: message }));
    },
  );

  it('keeps exit focus on startup progress and moves to the composer when it is ready', () => {
    executeOnboarding();
    reportRuntime('probing');
    expect(document.querySelector('[data-onboarding-step="0"] h2')?.textContent).toBe(
      'Checking the developer runtime…',
    );
    click('onboardingNext');
    click('onboardingNext');
    click('onboardingNext');
    expect(document.getElementById('onboardingNext')?.textContent).toBe('Done');
    click('onboardingNext');
    expect(document.activeElement?.id).toBe('runtimeStatusTitle');

    reportRuntime('ready');
    expect(document.activeElement?.id).toBe('userInput');
  });

  it('keeps Tab and Shift+Tab inside the intro when focus starts on the heading', () => {
    executeOnboarding();
    const heading = document.activeElement;
    expect(heading?.tagName).toBe('H2');
    const backward = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    heading?.dispatchEvent(backward);
    expect(backward.defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe('onboardingNext');

    const forward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.activeElement?.dispatchEvent(forward);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe('onboardingSkip');
  });
});
