/**
 * runtimePill.webview.test.ts — the header trust-boundary pill.
 *
 * VSCX-06: the pill was hardcoded in the HTML as a teal dot labelled
 * "Local host" with title "Workspace-local runtime". It never consulted any
 * state, so it made that claim on BYOK and on Managed Cloud too — the one
 * indicator a user would check to see whether their prompts leave the machine
 * asserted "local" no matter where they actually went.
 *
 * Local, BYOK and Managed Cloud are separate trust boundaries. Account usage
 * is not routing authority, so these tests assert that the pill stays neutral
 * until the CLI's session boundary arrives and cannot be overwritten by a
 * later account refresh.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWebviewContent } from '../features/sidebar-webview/webviewContent';

function makeWebview() {
  return {
    cspSource: 'vscode-webview://mock',
    asWebviewUri: (uri: { toString(): string }) => ({
      toString: () => uri.toString().replace(/^file:/, 'https://mock'),
    }),
  };
}

function makeExtensionUri() {
  return {
    toString: () => 'file:///mock/extension',
    fsPath: '/mock/extension',
  };
}

function renderWebview(): string {
  return getWebviewContent(
    makeWebview() as unknown as Parameters<typeof getWebviewContent>[0],
    makeExtensionUri() as unknown as Parameters<typeof getWebviewContent>[1],
    'test-nonce-base64url-32-chars-abcdef',
    'auto',
    'medium',
    true,
    false,
    'pro',
  );
}

function executeWebviewScript(): void {
  const parsed = new DOMParser().parseFromString(renderWebview(), 'text/html');
  document.head.innerHTML = parsed.head.innerHTML;
  document.body.innerHTML = parsed.body.innerHTML;

  Object.defineProperty(globalThis, 'acquireVsCodeApi', {
    configurable: true,
    value: () => ({ postMessage: vi.fn() }),
  });

  const inlineScript = Array.from(parsed.querySelectorAll('script')).find((script) =>
    script.textContent?.includes('acquireVsCodeApi()'),
  );
  expect(inlineScript?.textContent).toBeTruthy();

  new Function(inlineScript?.textContent ?? '')();
}

function postUsageMeter(source: string): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type: 'usageMeter', payload: { source, remaining: 0.5, usageLabel: '' } },
    }),
  );
}

function postSignedInAccount(): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: {
        type: 'accountStatus',
        payload: {
          status: 'signed-in',
          identity: {
            displayName: 'Ada Lovelace',
            email: 'ada@example.com',
            accountType: 'Personal account',
            planName: 'Pro',
            tier: 'pro',
          },
        },
      },
    }),
  );
}

function postProvider(providerLabel: string): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: {
        type: 'providerBadge',
        payload: { providerLabel, brandColor: '#abcdef' },
      },
    }),
  );
}

function postSessionBoundary(trustMode: 'local' | 'byok' | 'managed', provider?: string): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: {
        type: 'sessionBoundary',
        payload: { trustMode, ...(provider === undefined ? {} : { provider }) },
      },
    }),
  );
}

function pill() {
  return {
    root: document.getElementById('sessionIdentity'),
    label: document.getElementById('sessionBoundaryLabel'),
    provider: document.getElementById('sessionProviderLabel'),
  };
}

describe('header trust-boundary pill', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'acquireVsCodeApi');
    vi.restoreAllMocks();
  });

  it('does not ship a hardcoded "Local host" claim in the markup', () => {
    const html = renderWebview();
    expect(html).not.toContain('Local host');
    expect(html).not.toContain('title="Workspace-local runtime"');
  });

  it('stays hidden until a real source arrives', () => {
    executeWebviewScript();
    expect(pill().root?.style.display).toBe('none');
    expect(pill().label?.textContent).toBe('');
  });

  it.each([
    ['unbounded', 'local', 'Local', 'local', 'nothing leaves this machine'],
    ['user-api-key', 'byok', 'BYOK', 'byok', 'straight to the provider'],
    ['managed-plan', 'managed', 'Managed Cloud', 'cloud', 'sent to AGI infrastructure'],
  ] as const)(
    'waits for the CLI before reporting %s as "%s"',
    (source, trustMode, label, boundary, titleFragment) => {
      executeWebviewScript();
      postUsageMeter(source);

      expect(pill().label?.textContent).toBe('Route pending');
      expect(pill().root?.dataset.boundary).toBe('none');

      postSessionBoundary(trustMode);

      const { root, label: labelEl } = pill();
      expect(labelEl?.textContent).toBe(label);
      expect(root?.style.display).toBe('inline-flex');
      expect(root?.dataset.boundary).toBe(boundary);
      expect(root?.title).toContain(titleFragment);
    },
  );

  it('switches away from Local when the session moves to managed cloud', () => {
    executeWebviewScript();

    postUsageMeter('unbounded');
    postSessionBoundary('local');
    expect(pill().label?.textContent).toBe('Local');

    postSessionBoundary('managed');
    expect(pill().label?.textContent).toBe('Managed Cloud');
    expect(pill().root?.dataset.boundary).toBe('cloud');
  });

  it('keeps an unknown account usage source neutral until the CLI confirms the route', () => {
    executeWebviewScript();
    postUsageMeter('something-new-from-the-host');

    expect(pill().label?.textContent).toBe('Route pending');
    expect(pill().root?.dataset.boundary).toBe('none');
  });

  it('shows the Managed Cloud plan owner in the stable identity', () => {
    executeWebviewScript();
    postUsageMeter('managed-plan');
    postSessionBoundary('managed');
    postSignedInAccount();

    expect(pill().root?.title).toContain('Account: Ada Lovelace (ada@example.com)');
    expect(pill().root?.title).toContain('Pro plan');
    expect(pill().root?.getAttribute('aria-label')).toContain('Managed Cloud');
  });

  it('identifies the signed-in account in BYOK without claiming it pays the provider', () => {
    executeWebviewScript();
    postUsageMeter('user-api-key');
    postSessionBoundary('byok');
    postSignedInAccount();

    expect(pill().root?.title).toContain('AGI Cloud sign-in: Ada Lovelace');
    expect(pill().root?.title).toContain('not used for provider billing');
  });

  it('combines provider and boundary regardless of host message order', () => {
    executeWebviewScript();
    postProvider('Ollama');
    expect(pill().root?.style.display).toBe('none');

    postUsageMeter('unbounded');
    expect(pill().label?.textContent).toBe('Route pending');
    expect(pill().provider?.textContent).toBe('');

    postSessionBoundary('local', 'ollama');
    expect(pill().label?.textContent).toBe('Local');
    expect(pill().provider?.textContent).toBe('ollama');
    expect(pill().root?.textContent).toContain('Local · ollama');
    expect(pill().root?.title).toContain('Provider: ollama');
  });

  it('does not let a later account usage refresh overwrite the CLI boundary', () => {
    executeWebviewScript();
    postUsageMeter('managed-plan');
    postSessionBoundary('local', 'ollama');

    postSignedInAccount();
    postUsageMeter('managed-plan');

    expect(pill().label?.textContent).toBe('Local');
    expect(pill().root?.dataset.boundary).toBe('local');
  });
});
