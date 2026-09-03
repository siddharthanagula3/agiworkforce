import { describe, expect, it } from 'vitest';
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

function render(tier?: string): string {
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

describe('getWebviewContent, F-01 regression: script must parse without SyntaxError', () => {
  it('every <script> tag body is valid JavaScript', () => {
    const html = render();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const scripts = Array.from(doc.querySelectorAll('script')).filter(
      (s) => s.textContent && s.textContent.trim().length > 0,
    );
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) {
      const body = script.textContent ?? '';
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
      expect(body).not.toMatch(
        /\bas\s+HTML(?:Option|Div|Button|Input|TextArea|Select|Anchor)Element\b/,
      );
      expect(body).not.toMatch(/\bas\s+Record\s*</);
    }
  });
});

describe('getWebviewContent, CSP', () => {
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

  it('img-src restricts to cspSource so a rendered transcript cannot beacon out', () => {
    const html = render();
    expect(html).toMatch(/img-src[^;]*vscode-webview:\/\/mock/);
    expect(html).not.toMatch(/img-src[^;]*\*/);
    expect(html).not.toMatch(/img-src[^;]*https:/);
    expect(html).not.toMatch(/img-src[^;]*data:/);
  });
});

describe('getWebviewContent, structural smoke', () => {
  it('presents workspace chat without a blanket cloud-auth gate', () => {
    const html = render();
    const doc = new DOMParser().parseFromString(html, 'text/html');

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

    expect(doc.querySelector('#sessionIdentity')?.getAttribute('role')).toBe('status');
    expect(doc.querySelector('#sessionIdentity')?.getAttribute('aria-live')).toBe('polite');
    expect(doc.querySelector('.provider-badge')).toBeNull();
    expect(doc.querySelector('#newChatBtn')).not.toBeNull();
    expect(doc.querySelector('#actionsBtn')?.getAttribute('aria-label')).toBe('More actions');
    expect(doc.querySelector('#accountBtn')).toBeNull();
    expect(doc.querySelector('#historyBtn')).toBeNull();
    expect(styles).toContain(
      '.header-left { gap: 4px; max-width: calc(100% - 64px); overflow: hidden; }',
    );
    expect(styles).toContain('.session-identity { max-width: calc(100vw - 108px); }');
    const scriptBody = Array.from(doc.querySelectorAll('script'))
      .map((script) => script.textContent ?? '')
      .join('\n');
    expect(scriptBody).toContain('function renderSessionIdentity()');
    expect(scriptBody).toContain(
      "sessionProviderLabel.textContent = showProviderIdentity ? activeProviderIdentity : ''",
    );
    expect(scriptBody).toContain('function applyAuthoritativeSessionBoundary(trustMode, provider)');
    expect(scriptBody).toContain("updateRuntimePill(trustMode === 'local'");
  });

  it('labels model, mode, effort, and the actual Enter shortcut without ambiguity', () => {
    const html = render();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const scriptBody = Array.from(doc.querySelectorAll('script'))
      .map((script) => script.textContent ?? '')
      .join('\n');

    expect(doc.querySelector('#modelPill')?.textContent).toBe('Model · Auto');
    expect(doc.querySelector('#controlsSummary')).not.toBeNull();
    expect(doc.querySelector('#controlsSummary')?.getAttribute('title')).toBe(
      'Mode and reasoning effort',
    );
    expect(doc.querySelector('#modeChip')).toBeNull();
    expect(doc.querySelector('#effortChip')).toBeNull();
    expect(doc.querySelector('#composerHint')?.textContent).toContain('Enter to send');
    expect(doc.querySelector('#composerHint')?.textContent).toContain('Shift+Enter for newline');
    expect(scriptBody).toContain("'Model · ' +");
    expect(scriptBody).toContain('function renderControlsSummary()');
    expect(scriptBody).toContain("mode + ' · ' + effortShort");
    expect(scriptBody).toContain("'Controls: ' + mode + ' mode'");
  });

  it('colours code from the shared host/fallback aliases and exposes Copy to keyboard focus', () => {
    const html = render();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const styles = Array.from(doc.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .join('\n');

    expect(styles).toContain('pre code { color: var(--text-primary)');
    expect(styles).toContain('pre { background: var(--bg-overlay)');
    expect(styles).not.toContain('var(--vscode-textPreformat-foreground');
    expect(styles).toContain('.copy-btn:focus-visible');
  });

  it('keeps account identity available while moving account and history behind More', () => {
    const html = render();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const scriptBody = Array.from(doc.querySelectorAll('script'))
      .map((script) => script.textContent ?? '')
      .join('\n');

    expect(doc.querySelector('#accountBtn')).toBeNull();
    expect(doc.querySelector('#accountStatusDot')).toBeNull();
    expect(doc.querySelector('#historyBtn')).toBeNull();
    expect(doc.querySelector('#actionsBtn')?.getAttribute('title')).toBe('More');
    expect(scriptBody).toContain("vscode.postMessage({ type: 'openActionSheet' })");
    expect(scriptBody).toContain("msg.type === 'accountStatus'");
    expect(scriptBody).toContain('activeAccountIdentity.displayName');
    expect(scriptBody).toContain('activeAccountIdentity.email');
    expect(scriptBody).toContain('activeAccountIdentity.planName');
    expect(scriptBody).toContain("' · Account: ' + activeAccountIdentity.displayName");
    expect(scriptBody).toContain("' (not used for provider billing)'");
  });

  it('provides an inline first-run recovery path for an unavailable developer runtime', () => {
    const html = render();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const scriptBody = Array.from(doc.querySelectorAll('script'))
      .map((script) => script.textContent ?? '')
      .join('\n');

    expect(doc.querySelector('#runtimeStatus')?.getAttribute('role')).toBe('status');
    expect(doc.querySelector('#runtimeSettingsBtn')?.textContent).toContain('Open setup');
    expect(scriptBody).toContain("msg.type === 'runtimeStatus'");
    expect(scriptBody).toContain(
      'No workspace prompt will be sent until the protocol-7 runtime connects.',
    );
    expect(scriptBody).toContain("runtimeSettingsBtn.addEventListener('click'");
    expect(scriptBody).toContain("runtimeBlock === 'workspace-required'");
    expect(scriptBody).toContain(": 'openSettings'");
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
    expect(doc.querySelector('#plusMenuLabel')?.textContent).toBe('Add workspace context');
    expect(doc.querySelector('#plusMenuUpload')?.textContent).toContain('Workspace files');
    expect(doc.querySelector('#plusMenuBrowse')?.textContent).toContain('Browse the web');
    expect(doc.querySelector('#plusMenuBrowse')?.textContent).toContain(
      'Local privacy mode refuses network',
    );
    expect(doc.querySelector('#plusMenuPlanMode')?.textContent).toContain('Plan mode');
    expect(doc.querySelector('#controlsSummary')).not.toBeNull();
    expect(doc.querySelector('#plusMenuActions')).toBeNull();
  });

  it('keeps the primary composer controls on-screen in a narrow VS Code sidebar', () => {
    const html = render();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const styles = Array.from(doc.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .join('\n');

    expect(styles).toContain('@media (max-width: 480px)');
    expect(styles).toContain('@media (max-width: 380px)');
    expect(styles).toContain('.composer-card.is-streaming .controls-summary { display: none; }');
    expect(styles).not.toMatch(/(?:^|\n)\s*\.controls-summary \{ display: none; \}/);
    expect(styles).toContain('.controls-summary { max-width: 86px; }');
    expect(styles).toContain('.controls-summary { max-width: 72px; }');
    expect(styles).toContain('.composer-card.is-streaming .controls-summary { display: none; }');
    expect(doc.querySelector('#controlsSummary')).not.toBeNull();
    expect(doc.querySelector('#plusMenuActions')).toBeNull();
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

  it('renders host-provided provider routing inside the stable session identity', () => {
    const html = render();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const scriptBody = Array.from(doc.querySelectorAll('script'))
      .map((script) => script.textContent ?? '')
      .join('\n');

    expect(doc.querySelector('#sessionBoundaryLabel')).not.toBeNull();
    expect(doc.querySelector('#sessionProviderLabel')).not.toBeNull();
    expect(scriptBody).toContain("activeProviderIdentity = providerLabel || ''");
    expect(scriptBody).toContain(
      "sessionProviderLabel.textContent = showProviderIdentity ? activeProviderIdentity : ''",
    );
    expect(scriptBody).toContain("sessionIdentity.setAttribute('data-boundary', spec.boundary)");
    expect(scriptBody).not.toContain('providerBadgeDotEl');
    expect(scriptBody).not.toContain('providerBadgeEl.style');
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
