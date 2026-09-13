import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const readSource = (rel: string): string => readFileSync(join(here, rel), 'utf8');
const source = readSource('../src/side_panel.ts');

describe('Chrome side-panel interaction accessibility', () => {
  it('uses keyboard-native controls for model, attachment, and slash-command actions', () => {
    expect(source).toContain("const opt = el('button', {");
    expect(source).toContain("const screenshotItem = el('button', {");
    expect(source).toContain("const fileItem = el('button', {");
    expect(source).toContain("const item = el('button', {");
    expect(source).toContain("class: `sp-slash-item${i === slashActive ? ' active' : ''}`");
  });

  it('names the composer controls and announces streamed chat updates', () => {
    expect(source).toMatch(
      /id: 'sp-messages',[\s\S]{0,80}role: 'log',[\s\S]{0,80}'aria-live': 'polite'/,
    );
    expect(source).toContain("'aria-label': 'Message AGI'");
    expect(source).toContain("'aria-label': 'Send message'");
    expect(source).toContain("'aria-label': 'Add attachment'");
    expect(source).toContain("'aria-label': 'Voice input'");
  });

  it('does not expose an autonomy selector whose value is not connected to execution', () => {
    expect(source).not.toContain("id: 'sp-action-mode-toggle'");
    expect(source).not.toContain('Act without asking');
  });

  it('gives every tab a tabpanel it controls, and every panel a tab that labels it', () => {
    const tabs = [
      ...source.matchAll(/'data-tab': '([a-z-]+)',[\s\S]{0,120}?'aria-controls': '([\w-]+)'/g),
    ];
    expect(tabs.map((match) => match[1])).toEqual([
      'chat',
      'workflows',
      'computer-use',
      'cloud-runs',
      'page',
    ]);
    // Two of the four panels are built in their own modules, so the element a
    // tab claims to control has to be looked for across all of them.
    const panelSources = [
      source,
      readSource('../src/features/side-panel/computerUsePanel.ts'),
      readSource('../src/features/side-panel/cloudRunsPanel.ts'),
      readSource('../src/features/side-panel/browserToolsPanel.ts'),
    ].join('\n');
    for (const [, tab, controls] of tabs) {
      expect(source).toContain(`id: 'sp-tab-${tab}'`);
      expect(panelSources, `no panel with id ${controls}`).toMatch(
        new RegExp(`id: ['\`]${controls}['\`]|panelEl\\.id = '${controls}'`),
      );
    }
    expect(source).toContain("'aria-labelledby', 'sp-tab-cloud-runs'");
  });

  it('keeps the roving tabindex over the whole tab set, not a stale subset', () => {
    expect(source).toContain(
      'const viewTabs = [chatTabBtn, workflowsTabBtn, cuTabBtn, runsTabBtn, pageTabBtn]',
    );
    const switchBody = source.slice(
      source.indexOf('function switchTab(tab: SidePanelTab)'),
      source.indexOf("chatTabBtn.addEventListener('click'"),
    );
    for (const button of [
      'chatTabBtn',
      'workflowsTabBtn',
      'cuTabBtn',
      'runsTabBtn',
      'pageTabBtn',
    ]) {
      expect(switchBody, `${button} has no aria-selected update`).toContain(
        `${button}.setAttribute('aria-selected'`,
      );
      expect(switchBody, `${button} has no roving tabindex`).toContain(`${button}.tabIndex =`);
    }
  });

  it('mounts every panel it declares a tab for, so no tab opens onto nothing', () => {
    expect(source).toContain('document.body.appendChild(cuPanel.panelEl)');
    expect(source).toContain('document.body.appendChild(runsPanel.panelEl)');
    expect(source).toContain('document.body.appendChild(pagePanel.panelEl)');
    expect(source).toContain('buildBrowserToolsPanel()');
    expect(source).toContain('BROWSER_TOOLS_PANEL_CSS');
    expect(source).toContain('buildCloudRunsPanel()');
    expect(source).toContain('CLOUD_RUNS_PANEL_CSS');
    expect(source).toContain("runsPanel.setActive(tab === 'cloud-runs')");
  });

  it('keeps the create-shortcut modal contained and restores keyboard focus', () => {
    expect(source).toContain("'aria-labelledby': 'sp-create-shortcut-title'");
    expect(source).toContain("'aria-modal': 'true'");
    expect(source).toContain("createShortcutModal.addEventListener('keydown'");
    expect(source).toContain("if (event.key === 'Escape')");
    expect(source).toContain("if (event.key !== 'Tab') return");
    expect(source).toContain('createShortcutReturnFocus.focus()');
  });

  it('keeps the create-shortcut dialog open when background persistence is rejected', () => {
    expect(source).toContain('if (runtimeError || !response?.success)');
    expect(source).toContain(
      "response?.error ?? runtimeError?.message ?? t('spShortcutSaveFailed')",
    );
  });
});

describe('Chrome side-panel composer at side-panel widths', () => {
  it('truncates the reasoning-effort label instead of cutting the word in half', () => {
    // text-overflow has no effect on the anonymous flex item a bare text node
    // becomes inside an inline-flex button, so the label owns a box of its own.
    expect(source).toContain("const effortButtonLabel = el('span', { id: 'sp-effort-btn-label' })");
    expect(source).toContain('effortButtonLabel.textContent = t(');
    expect(source).toMatch(
      /#sp-effort-btn-label \{[^}]*overflow: hidden;[^}]*text-overflow: ellipsis;/,
    );
  });

  it('gives the autonomy chip a 24px pointer target without resizing the chip', () => {
    expect(source).toMatch(/\.sp-autonomy-chip \{[\s\S]*?height: 20px;/);
    expect(source).toMatch(/\.sp-autonomy-chip::after \{[^}]*inset: -4px 0 0;/);
  });

  it('drops attached page text once its source page is no longer the active one', () => {
    expect(source).toContain('function dropPageContextOnNavigation(');
    expect(source).toContain('pageContextStillDescribes(_ctx.pendingPageContextSource');
    expect(source).toContain("composerContextNotice = t('spContextChipDropped')");
    expect(source).toMatch(
      /function updateActivePage\(url: string, tabId\?: number\): void \{\n\s*dropPageContextOnNavigation\(tabId, url\);/,
    );
  });
});
