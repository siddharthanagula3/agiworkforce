/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getWebviewContent } from '../features/sidebar-webview/webviewContent';

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
    value: () => ({ postMessage }),
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
    expect(onboarding?.style.display).toBe('flex');
    expect(onboarding?.getAttribute('aria-hidden')).toBe('false');
    expect(back.disabled).toBe(true);
    expect((document.querySelector('.input-area') as HTMLElement & { inert: boolean }).inert).toBe(
      true,
    );
    expect(document.getElementById('onboardingProgress')?.textContent).toBe('Step 1 of 4');
    expect(document.querySelector('[data-onboarding-step="0"]')?.hasAttribute('hidden')).toBe(
      false,
    );
    expect(document.querySelector('[data-onboarding-step="1"]')?.hasAttribute('hidden')).toBe(true);
  });

  it('explains task availability honestly and provides an explicit Web handoff', () => {
    const { postMessage } = executeOnboarding();
    click('onboardingNext');

    expect(document.getElementById('onboardingProgress')?.textContent).toBe('Step 2 of 4');
    expect(document.body.textContent).toContain('Hosted background task creation');
    expect(document.body.textContent).toContain('remain on the Web Tasks surface');
    click('onboardingTasks');
    expect(postMessage).toHaveBeenCalledWith({ type: 'openWebTasks' });
  });

  it('places autonomy, fallibility, active boundary, and privacy links before completion', () => {
    const { postMessage } = executeOnboarding();
    click('onboardingNext');
    click('onboardingNext');
    click('onboardingNext');

    expect(document.getElementById('onboardingProgress')?.textContent).toBe('Step 4 of 4');
    expect(document.body.textContent).toContain('Ask, Auto, Plan, or Bypass');
    expect(document.body.textContent).toContain('AGI can make mistakes');
    expect(document.body.textContent).toContain('Review generated code and every command');
    expect(document.getElementById('onboardingBoundary')?.textContent).toContain(
      'Active developer-session boundary: Local',
    );

    click('onboardingPermissionDocs');
    click('onboardingPrivacySettings');
    expect(postMessage).toHaveBeenCalledWith({ type: 'openPermissionDocs' });
    expect(postMessage).toHaveBeenCalledWith({ type: 'openPrivacySettings' });
  });

  it('persists completion, hides the intro, and supports host-triggered replay', () => {
    const { postMessage } = executeOnboarding();
    click('onboardingSkip');

    expect(document.getElementById('onboarding')?.style.display).toBe('none');
    expect((document.querySelector('.input-area') as HTMLElement & { inert: boolean }).inert).toBe(
      false,
    );
    expect(postMessage).toHaveBeenCalledWith({ type: 'completeOnboarding' });

    window.dispatchEvent(new MessageEvent('message', { data: { type: 'showOnboarding' } }));
    expect(document.getElementById('onboarding')?.style.display).toBe('flex');
    expect(document.getElementById('onboardingProgress')?.textContent).toBe('Step 1 of 4');
  });
});
