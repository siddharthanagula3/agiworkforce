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
    ]);
    // Two of the four panels are built in their own modules, so the element a
    // tab claims to control has to be looked for across all of them.
    const panelSources = [
      source,
      readSource('../src/features/side-panel/computerUsePanel.ts'),
      readSource('../src/features/side-panel/cloudRunsPanel.ts'),
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
      'const viewTabs = [chatTabBtn, workflowsTabBtn, cuTabBtn, runsTabBtn]',
    );
    const switchBody = source.slice(
      source.indexOf('function switchTab(tab: SidePanelTab)'),
      source.indexOf("chatTabBtn.addEventListener('click'"),
    );
    for (const button of ['chatTabBtn', 'workflowsTabBtn', 'cuTabBtn', 'runsTabBtn']) {
      expect(switchBody, `${button} has no aria-selected update`).toContain(
        `${button}.setAttribute('aria-selected'`,
      );
      expect(switchBody, `${button} has no roving tabindex`).toContain(`${button}.tabIndex =`);
    }
  });

  it('mounts every panel it declares a tab for, so no tab opens onto nothing', () => {
    expect(source).toContain('document.body.appendChild(cuPanel.panelEl)');
    expect(source).toContain('document.body.appendChild(runsPanel.panelEl)');
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
