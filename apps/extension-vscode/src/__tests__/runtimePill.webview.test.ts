/**
 * runtimePill.webview.test.ts — the header trust-boundary pill.
 *
 * VSCX-06: the pill was hardcoded in the HTML as a teal dot labelled
 * "Local host" with title "Workspace-local runtime". It never consulted any
 * state, so it made that claim on BYOK and on Managed Cloud too — the one
 * indicator a user would check to see whether their prompts leave the machine
 * asserted "local" no matter where they actually went.
 *
 * Local, BYOK and Managed Cloud are separate trust boundaries, so these tests
 * drive the real webview script with each `usageMeter.source` and assert the
 * pill names the live one.
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

  // Parser/runtime coverage for the real nonce-authorized webview script.
  // llm-guardrail-allow: executes repository-owned webview JavaScript in jsdom
  new Function(inlineScript?.textContent ?? '')();
}

/** Deliver a `usageMeter` message the same way the extension host does. */
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

function pill() {
  return {
    root: document.getElementById('runtimePill'),
    label: document.getElementById('runtimePillLabel'),
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
    // The regression itself: a static label asserting a local runtime.
    expect(html).not.toContain('Local host');
    expect(html).not.toContain('title="Workspace-local runtime"');
  });

  it('stays hidden until a real source arrives', () => {
    executeWebviewScript();
    expect(pill().root?.style.display).toBe('none');
    expect(pill().label?.textContent).toBe('');
  });

  it.each([
    ['unbounded', 'Local', 'local', 'nothing leaves this machine'],
    ['user-api-key', 'BYOK', 'byok', 'straight to the provider'],
    ['managed-plan', 'Cloud', 'cloud', 'sent to AGI infrastructure'],
  ])('reports %s as "%s"', (source, label, boundary, titleFragment) => {
    executeWebviewScript();
    postUsageMeter(source);

    const { root, label: labelEl } = pill();
    expect(labelEl?.textContent).toBe(label);
    expect(root?.style.display).toBe('inline-flex');
    expect(root?.dataset.boundary).toBe(boundary);
    expect(root?.title).toContain(titleFragment);
  });

  it('switches away from Local when the session moves to managed cloud', () => {
    executeWebviewScript();

    postUsageMeter('unbounded');
    expect(pill().label?.textContent).toBe('Local');

    // The exact silent-reroute the old hardcoded pill could not represent.
    postUsageMeter('managed-plan');
    expect(pill().label?.textContent).toBe('Cloud');
    expect(pill().root?.dataset.boundary).toBe('cloud');
  });

  it('falls back to the cloud (most cautious) label for an unknown source', () => {
    executeWebviewScript();
    postUsageMeter('something-new-from-the-host');

    // Never silently claim "Local" for a source this webview does not know.
    expect(pill().label?.textContent).toBe('Cloud');
    expect(pill().root?.dataset.boundary).toBe('cloud');
  });

  it('shows the Managed Cloud plan owner in the boundary and account tooltips', () => {
    executeWebviewScript();
    postUsageMeter('managed-plan');
    postSignedInAccount();

    expect(pill().root?.title).toContain('Account: Ada Lovelace (ada@example.com)');
    expect(pill().root?.title).toContain('Pro plan');
    const accountButton = document.getElementById('accountBtn');
    expect(accountButton?.title).toContain('Ada Lovelace (ada@example.com)');
    expect(accountButton?.title).toContain('Personal account · Pro plan');
    expect(accountButton?.getAttribute('aria-label')).toBe(accountButton?.title);
  });

  it('identifies the signed-in account in BYOK without claiming it pays the provider', () => {
    executeWebviewScript();
    postUsageMeter('user-api-key');
    postSignedInAccount();

    expect(pill().root?.title).toContain('AGI Cloud sign-in: Ada Lovelace');
    expect(pill().root?.title).toContain('not used for provider billing');
  });
});
