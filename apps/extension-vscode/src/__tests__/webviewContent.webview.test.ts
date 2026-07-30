/**
 * webviewContent.webview.test.ts — jsdom-based smoke + security tests
 * for the rendered webview HTML produced by getWebviewContent().
 *
 * Catches F-01-class bugs (TS syntax leaking into the webview JS string
 * body causes the entire script to fail at parse time, breaking the
 * sidebar chat panel) and F-02-class bugs (CSP misconfiguration that
 * would allow inline scripts or third-party domains).
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
// AUDIT-FIX: BUILD-BLOCKER
import { getWebviewContent } from '../features/sidebar-webview/webviewContent';

// Build a minimal stub for the `webview` parameter that getWebviewContent
// requires. We only need `cspSource` and `asWebviewUri` to return Uri-like.
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

function render(tier?: string): string {
  // The webview/uri parameters are constructed structurally above; cast
  // through `unknown` to bridge the local stub shape to the imported
  // vscode types without depending on the real vscode runtime.
  return getWebviewContent(
    makeWebview() as unknown as Parameters<typeof getWebviewContent>[0],
    makeExtensionUri() as unknown as Parameters<typeof getWebviewContent>[1],
    'test-nonce-base64url-32-chars-abcdef',
    'auto',
    'medium',
    true,
    false,
    tier,
  );
}

describe('getWebviewContent — F-01 regression: script must parse without SyntaxError', () => {
  it('every <script> tag body is valid JavaScript', () => {
    const html = render();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const scripts = Array.from(doc.querySelectorAll('script')).filter(
      (s) => s.textContent && s.textContent.trim().length > 0,
    );
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) {
      const body = script.textContent ?? '';
      // Use the Function constructor to parse; throws SyntaxError on bad JS.
      // llm-guardrail-allow: parser-only use in a test; the constructed function is never invoked
      expect(() => new Function(body)).not.toThrow();
    }
  });

  it('does not contain TypeScript "as" cast syntax in script bodies', () => {
    const html = render();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const scripts = Array.from(doc.querySelectorAll('script')).filter(
      (s) => s.textContent && s.textContent.trim().length > 0,
    );
    for (const script of scripts) {
      const body = script.textContent ?? '';
      // The specific F-01 footprint plus other common cast targets.
      expect(body).not.toMatch(
        /\bas\s+HTML(?:Option|Div|Button|Input|TextArea|Select|Anchor)Element\b/,
      );
      expect(body).not.toMatch(/\bas\s+Record\s*</);
    }
  });
});

describe('getWebviewContent — CSP', () => {
  it('declares default-src none', () => {
    const html = render();
    expect(html).toMatch(/default-src\s+'none'/);
  });

  it('script-src uses nonce', () => {
    const html = render();
    expect(html).toMatch(/script-src[^;]*'nonce-test-nonce-base64url-32-chars-abcdef'/);
  });

  it('does not allow unsafe-inline scripts', () => {
    const html = render();
    expect(html).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(html).not.toMatch(/script-src[^;]*'unsafe-eval'/);
  });

  it('img-src restricts to cspSource, https, and data', () => {
    const html = render();
    // Matches "img-src vscode-webview://mock https: data:" — verify the host
    // allowlist limit (no wildcard).
    expect(html).toMatch(/img-src[^;]*vscode-webview:\/\/mock/);
    expect(html).not.toMatch(/img-src[^;]*\*/);
  });
});

describe('getWebviewContent — structural smoke', () => {
  it('presents chat as a local developer session without cloud-auth gating', () => {
    const html = render();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    // Previously asserted a hardcoded "Local host" label here. That label was
    // the VSCX-06 defect (it claimed a local runtime on every trust boundary),
    // and the absence of cloud-auth gating is what this test is actually about.
    // The live boundary is covered by runtimePill.webview.test.ts.
    expect(doc.querySelector('#apiKeyBanner')).toBeNull();
    expect(doc.querySelector('#signInBtn')).toBeNull();
    expect(doc.querySelector('#cloudHistoryBtn')).toBeNull();
    expect(doc.querySelector('#userInput')?.hasAttribute('disabled')).toBe(false);
  });

  it('contains the chat input and send button', () => {
    const html = render();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelector('#userInput')).not.toBeNull();
    expect(doc.querySelector('#sendBtn')).not.toBeNull();
    expect(doc.querySelector('#sendBtn')?.getAttribute('title')).toBe('Send (Enter)');
  });

  it('keeps runtime and routing identity visible in narrow layouts', () => {
    const html = render();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const styles = Array.from(doc.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .join('\n');

    // The pill's label and title are populated by updateRuntimePill() from the
    // live usageMeter source (VSCX-06) — the markup no longer hardcodes a
    // boundary, so this only asserts the element survives the narrow layout.
    expect(doc.querySelector('.runtime-pill')).not.toBeNull();
    expect(styles).not.toContain('.runtime-pill { display: none; }');
    expect(styles).not.toContain('.provider-badge { display: none !important; }');
    expect(styles).toContain(
      '.header-left { gap: 4px; max-width: calc(100% - 112px); overflow: hidden; }',
    );
    expect(styles).toContain('.runtime-pill { max-width: 66px;');
    expect(styles).toContain('.provider-badge { max-width: 54px;');
    const scriptBody = Array.from(doc.querySelectorAll('script'))
      .map((script) => script.textContent ?? '')
      .join('\n');
    expect(scriptBody).toContain('providerBadgeEl.title = providerLabel');
    expect(scriptBody).toContain('updateRuntimePill(payload.source)');
  });

  it('labels model, mode, effort, and the actual Enter shortcut without ambiguity', () => {
    const html = render();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const scriptBody = Array.from(doc.querySelectorAll('script'))
      .map((script) => script.textContent ?? '')
      .join('\n');

    expect(doc.querySelector('#modelPill')?.textContent).toBe('Model · Auto');
    expect(doc.querySelector('#modeChip')?.textContent).toContain('Mode ·');
    expect(doc.querySelector('#effortChip')?.textContent).toContain('Effort ·');
    expect(doc.querySelector('#composerHint')?.textContent).toContain('Enter to send');
    expect(doc.querySelector('#composerHint')?.textContent).toContain('Shift+Enter for newline');
    expect(scriptBody).toContain("'Model · ' +");
    expect(scriptBody).toContain("'Mode · ' +");
    expect(scriptBody).toContain("'Effort · ' +");
  });

  it('uses theme-aware code colors and exposes Copy to keyboard focus', () => {
    const html = render();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const styles = Array.from(doc.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .join('\n');

    expect(styles).toContain('var(--vscode-textPreformat-foreground');
    expect(styles).toContain('var(--vscode-textCodeBlock-background');
    expect(styles).toContain('.copy-btn:focus-visible');
  });

  it('exposes a visible AGI Cloud account control with signed-in and reconnect states', () => {
    const html = render();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const scriptBody = Array.from(doc.querySelectorAll('script'))
      .map((script) => script.textContent ?? '')
      .join('\n');

    expect(doc.querySelector('#accountBtn')?.getAttribute('aria-label')).toBe('AGI Cloud account');
    expect(doc.querySelector('#accountStatusDot')).not.toBeNull();
    expect(scriptBody).toContain("vscode.postMessage({ type: 'openAccount' })");
    expect(scriptBody).toContain("msg.type === 'accountStatus'");
    expect(scriptBody).toContain("'Reconnect to AGI Cloud'");
    expect(scriptBody).toContain('activeAccountIdentity.displayName');
    expect(scriptBody).toContain('activeAccountIdentity.email');
    expect(scriptBody).toContain('activeAccountIdentity.accountType');
    expect(scriptBody).toContain('activeAccountIdentity.planName');
    expect(scriptBody).toContain("accountBtn.setAttribute('aria-label', accountBtn.title)");
    expect(scriptBody).toContain("' (not used for provider billing)'");
  });

  it('provides an inline first-run recovery path for an unavailable local runtime', () => {
    const html = render();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const scriptBody = Array.from(doc.querySelectorAll('script'))
      .map((script) => script.textContent ?? '')
      .join('\n');

    expect(doc.querySelector('#runtimeStatus')?.getAttribute('role')).toBe('status');
    expect(doc.querySelector('#runtimeSettingsBtn')?.textContent).toContain('Open setup');
    expect(scriptBody).toContain("msg.type === 'runtimeStatus'");
    expect(scriptBody).toContain("vscode.postMessage({ type: 'openSettings' })");
  });

  it('keeps async chat updates announced and exposes keyboard-native popup controls', () => {
    const html = render();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(doc.querySelector('#messages')?.getAttribute('role')).toBe('log');
    expect(doc.querySelector('#messages')?.getAttribute('aria-live')).toBe('polite');
    expect(doc.querySelector('#plusMenuUpload')?.tagName).toBe('BUTTON');
    expect(doc.querySelector('#plusMenuBrowse')?.tagName).toBe('BUTTON');
    expect(doc.querySelector('#plusMenuPlanMode')?.tagName).toBe('BUTTON');
    expect(doc.querySelector('#plusBtn')?.getAttribute('aria-label')).toBe('Attach or use tools');
    expect(doc.querySelector('#meterDismissBtn')?.getAttribute('aria-label')).toBe(
      'Collapse usage meter',
    );
    expect(doc.querySelector('#plusMenuPlanMode')?.textContent).toContain('Plan mode');
    expect(doc.querySelector('#plusMenuPlanMode')?.textContent).not.toContain('Add context');
  });

  it('presents a polished workspace-first empty state and capability-aware add menu', () => {
    const html = render();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    expect(doc.querySelector('#emptyState .empty-state-mark')).not.toBeNull();
    expect(doc.querySelector('#emptyState .empty-state-headline')?.textContent).toContain(
      'Build with AGI',
    );
    expect(doc.querySelector('#emptyState .empty-state-copy')?.textContent).toContain(
      'edit files, run commands, and test this workspace',
    );
    expect(doc.querySelector('#composerHint')?.textContent).toContain('to send');
    expect(doc.querySelector('#plusMenuLabel')?.textContent).toBe('Add to this chat');
    expect(doc.querySelector('#plusMenuUpload')?.textContent).toContain('Workspace files');
    expect(doc.querySelector('#plusMenuBrowse')?.textContent).toContain('Browse the web');
    expect(doc.querySelector('#plusMenuBrowse')?.textContent).toContain(
      'Local privacy mode refuses network',
    );
    expect(doc.querySelector('#plusMenuPlanMode')?.textContent).toContain('Plan mode');
    expect(doc.querySelector('#plusMenuActions')?.textContent).toContain('Tools and actions');
  });

  it('keeps the primary composer controls on-screen in a narrow VS Code sidebar', () => {
    const html = render();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const styles = Array.from(doc.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .join('\n');

    expect(styles).toContain('@media (max-width: 480px)');
    expect(styles).toMatch(
      /\.mode-chip,\s*\.effort-chip\s*\{\s*display:\s*none\s*!important;\s*\}/,
    );
    expect(doc.querySelector('#plusMenuActions')?.textContent).toContain('Models, reasoning');
  });

  it('submits an attachment-only turn with a visible trusted prompt', () => {
    const html = render();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const scriptBody = Array.from(doc.querySelectorAll('script'))
      .map((script) => script.textContent ?? '')
      .join('\n');

    expect(scriptBody).toContain("'Please analyze the attached file.'");
    expect(scriptBody).toContain("'Please analyze the attached files.'");
    expect(scriptBody).toContain("msg.type === 'attachmentsConsumed'");
  });

  it('renders tool-call disclosure bars as native buttons', () => {
    const html = render();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const scriptBody = Array.from(doc.querySelectorAll('script'))
      .map((script) => script.textContent ?? '')
      .join('\n');

    expect(scriptBody).toContain("var bar = document.createElement('button')");
    expect(scriptBody).not.toContain("bar.setAttribute('role', 'button')");
  });

  it('renders structured tool requests and responses in an inline collapsed disclosure', () => {
    const html = render();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const scriptBody = Array.from(doc.querySelectorAll('script'))
      .map((script) => script.textContent ?? '')
      .join('\n');

    expect(scriptBody).toContain("requestLabel.textContent = 'Request'");
    expect(scriptBody).toContain("responseLabel.textContent = 'Response'");
    expect(scriptBody).toContain('requestEl.textContent = formatToolPayload(input)');
    expect(scriptBody).toContain('responseEl.textContent = formatToolPayload(msg.payload.output)');
    expect(scriptBody).toContain(
      "tcEnd.el.classList.add(msg.payload.isError ? 'tool-call--error' : 'tool-call--done')",
    );
    expect(scriptBody).not.toContain('requestEl.innerHTML');
    expect(scriptBody).not.toContain('responseEl.innerHTML');
  });

  it('renders engine progress inline with collapsed, text-only detail', () => {
    const html = render();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const scriptBody = Array.from(doc.querySelectorAll('script'))
      .map((script) => script.textContent ?? '')
      .join('\n');

    expect(scriptBody).toContain("msg.type === 'progressUpdate'");
    expect(scriptBody).toContain('function upsertProgressEl(progressId, summary, detail, status)');
    expect(scriptBody).toContain("bar.setAttribute('aria-expanded', 'false')");
    expect(scriptBody).toContain("existing.bodyEl.textContent = detail || ''");
    expect(scriptBody).not.toContain('existing.bodyEl.innerHTML = detail');
  });

  it('contains a working inline model picker popover contract', () => {
    const html = render();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const scriptBody = Array.from(doc.querySelectorAll('script'))
      .map((script) => script.textContent ?? '')
      .join('\n');

    expect(doc.querySelector('#modelPill')).not.toBeNull();
    expect(doc.querySelector('#modelPopover')).not.toBeNull();
    expect(scriptBody).toContain("const modelPopoverEl = document.getElementById('modelPopover')");
    expect(scriptBody).toContain('function closeModelPopover()');
    expect(scriptBody).toContain("msg.type === 'modelPickerData'");
    expect(scriptBody).toContain("vscode.postMessage({ type: 'selectModel'");
    expect(scriptBody).toContain('if (options[i].disabled) continue;');
    expect(scriptBody).toContain("modelPill.textContent = 'Model · ' + msg.payload.model");
  });

  it('keeps locked model guidance out of the compact composer label', () => {
    const html = render('local');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const autoOption = doc.querySelector<HTMLOptionElement>('option[value="auto"]');
    const scriptBody = Array.from(doc.querySelectorAll('script'))
      .map((script) => script.textContent ?? '')
      .join('\n');

    expect(autoOption?.disabled).toBe(true);
    expect(autoOption?.dataset.displayLabel).toBe('Auto');
    expect(autoOption?.textContent).toContain('Sign in or add a provider key');
    expect(scriptBody).toContain('opt.dataset.displayLabel || opt.text');
  });

  it('renders the host-provided Auto routing identity without claiming a provider', () => {
    const html = render();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const scriptBody = Array.from(doc.querySelectorAll('script'))
      .map((script) => script.textContent ?? '')
      .join('\n');

    expect(scriptBody).toContain('providerBadgeDotEl.style.background = brandColor');
    expect(scriptBody).toContain("providerBadgeEl.style.background = 'var(--bg-overlay)'");
    expect(scriptBody).toContain("providerBadgeEl.style.display = 'inline-flex'");
  });

  it('nonce is present on style and script tags', () => {
    const html = render();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const styles = Array.from(doc.querySelectorAll('style'));
    const scripts = Array.from(doc.querySelectorAll('script'));
    for (const el of [...styles, ...scripts]) {
      expect(el.getAttribute('nonce')).toBe('test-nonce-base64url-32-chars-abcdef');
    }
  });
});
