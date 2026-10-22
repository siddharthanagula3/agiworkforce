/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSettingsWebviewContent } from '../features/settings/settingsWebviewContent';
import type { SettingsPanelState } from '../features/settings/settingsProtocol';
import { vscodeApiStub } from './vscodeApiStub';

const baseState: SettingsPanelState = {
  values: {
    apiEndpoint: 'https://agiworkforce.com/api/llm/v1',
    model: 'auto',
    cliPath: 'agi',
    'composer.followUpBehavior': 'queue',
    contextLines: 50,
    telemetryEnabled: false,
    hoverEnabled: false,
    codeLensEnabled: false,
    autoApplyFixes: false,
    'inlineCompletions.enabled': false,
    'inlineCompletions.debounceMs': 300,
    'inlineCompletions.maxLength': 500,
    'agent.mode': 'auto',
    'agent.effort': 'medium',
    'agent.thinking': false,
    currentTier: 'pro',
  },
  workspaceOverrides: [],
  workspaceTrusted: true,
  accountConnected: false,
  accountStatus: 'signed-out',
  agentConfigPath: '/host/.agiworkforce/config.toml',
  instructionContext: {
    host: 'Prefer focused tests.',
    workspace: '',
    effective: 'Prefer focused tests.',
    effectiveScope: 'host',
    turnPrelude: '',
    projectSources: [],
  },
};

function boot(state: SettingsPanelState = baseState): ReturnType<typeof vi.fn> {
  const parsed = new DOMParser().parseFromString(
    getSettingsWebviewContent(
      { cspSource: 'vscode-webview://settings-test' } as never,
      'settings-test-nonce',
      state,
      'general',
    ),
    'text/html',
  );
  document.head.innerHTML = parsed.head.innerHTML;
  document.body.innerHTML = parsed.body.innerHTML;
  const postMessage = vi.fn();
  Object.defineProperty(globalThis, 'acquireVsCodeApi', {
    configurable: true,
    value: () => vscodeApiStub({ postMessage }),
  });
  const script = Array.from(parsed.querySelectorAll('script')).find((candidate) =>
    candidate.textContent?.includes('acquireVsCodeApi()'),
  );
  // llm-guardrail-allow: executes repository-owned settings webview JavaScript in jsdom
  new Function(script?.textContent ?? '')();
  return postMessage;
}

function snapshot(state: Partial<SettingsPanelState>): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { type: 'settings.snapshot', state: { ...baseState, ...state } },
    }),
  );
}

function type(id: string, value: string): void {
  const textarea = document.getElementById(id) as HTMLTextAreaElement;
  textarea.value = value;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function saveButton(scope: 'host' | 'workspace'): HTMLButtonElement {
  return document.querySelector(`[data-instruction-save="${scope}"]`) as HTMLButtonElement;
}

describe('settings instruction saves', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'acquireVsCodeApi');
    vi.restoreAllMocks();
  });

  it('disables both save buttons until the text differs from what was saved', () => {
    boot();
    expect(saveButton('host').disabled).toBe(true);
    expect(saveButton('workspace').disabled).toBe(true);

    type('workspaceCustomInstructions', 'Use the workspace fixtures.');
    expect(saveButton('workspace').disabled).toBe(false);
    expect(saveButton('host').disabled).toBe(true);

    type('workspaceCustomInstructions', '');
    expect(saveButton('workspace').disabled).toBe(true);

    type('hostCustomInstructions', 'Prefer focused tests.');
    expect(saveButton('host').disabled).toBe(true);
    type('hostCustomInstructions', '');
    expect(saveButton('host').disabled).toBe(false);
  });

  it('does not post from a disabled save and disables it again once the host confirms', () => {
    const postMessage = boot();
    saveButton('workspace').click();
    expect(postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'settings.instructions.update' }),
    );

    type('workspaceCustomInstructions', 'Use the workspace fixtures.');
    saveButton('workspace').click();
    expect(postMessage).toHaveBeenCalledWith({
      type: 'settings.instructions.update',
      scope: 'workspace',
      value: 'Use the workspace fixtures.',
    });
    expect(saveButton('workspace').disabled).toBe(false);

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'settings.instructions.saved', scope: 'workspace' },
      }),
    );
    expect(saveButton('workspace').disabled).toBe(true);
  });

  it('treats the host snapshot as the new saved value', () => {
    boot();
    snapshot({
      instructionContext: { ...baseState.instructionContext!, workspace: 'Stored elsewhere.' },
    });
    expect(
      (document.getElementById('workspaceCustomInstructions') as HTMLTextAreaElement).value,
    ).toBe('Stored elsewhere.');
    expect(saveButton('workspace').disabled).toBe(true);
    type('workspaceCustomInstructions', '');
    expect(saveButton('workspace').disabled).toBe(false);
  });
});

describe('settings helper copy', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'acquireVsCodeApi');
  });

  it('keeps the personalization and hooks helpers to one sentence', () => {
    boot();
    const sentences = (text: string | null | undefined): number =>
      (text ?? '').split(/[.!?]\s+/u).filter((part) => part.trim().length > 0).length;
    const personalization = document.getElementById('section-personalization')!;
    const headings = Array.from(personalization.querySelectorAll('.card-heading')).slice(0, 2);
    expect(headings.map((heading) => heading.querySelector('h3')?.textContent)).toEqual([
      'Custom instructions',
      'Memory',
    ]);
    for (const heading of headings) {
      expect(sentences(heading.querySelector('p')?.textContent)).toBe(1);
    }

    const hooks = document.getElementById('section-hooks')!;
    expect(hooks.querySelector('h3')?.textContent).toBe('No hooks found');
    expect(sentences(hooks.querySelector('p')?.textContent)).toBe(1);
  });
});

describe('settings usage for the Free plan', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'acquireVsCodeApi');
  });

  function signedIn(tier: string): Partial<SettingsPanelState> {
    return {
      accountConnected: true,
      accountStatus: 'signed-in',
      accountIdentity: {
        displayName: 'Ada',
        email: null,
        accountType: 'Personal account',
        planName: tier === 'free' ? 'Free' : 'Pro',
        tier,
      },
      tierInfo: { tier, usagePercentage: 40 },
      planUsage: {
        planLabel: tier,
        windows: [{ label: 'Session', usage: '40% used', reset: '', usedPercent: 40 }],
        credits: {
          label: 'Credits',
          balance: '120 credits',
          spendability: 'Available',
          topUpLabel: 'Add credits',
        },
      },
      usageHistory: {
        status: 'unavailable',
        message: 'History is unavailable.',
      },
    };
  }

  it('shows Upgrade and no meters, credits or history for Free', () => {
    boot();
    snapshot(signedIn('free'));

    expect((document.getElementById('planUsageRow') as HTMLElement).hidden).toBe(true);
    expect((document.getElementById('planUsageWindows') as HTMLElement).hidden).toBe(true);
    expect(document.querySelector('#planUsageWindows .usage-progress')).toBeNull();
    expect((document.getElementById('planCreditsRow') as HTMLElement).hidden).toBe(true);
    expect((document.getElementById('usageHistoryCard') as HTMLElement).hidden).toBe(true);
    expect(document.getElementById('planPlansButton')?.textContent).toBe('Upgrade');
    expect(document.getElementById('planPlansButton')?.getAttribute('data-command')).toBe(
      'viewPlans',
    );
  });

  it('keeps the meters for a paid plan', () => {
    boot();
    snapshot(signedIn('pro'));

    expect((document.getElementById('planUsageWindows') as HTMLElement).hidden).toBe(false);
    expect((document.getElementById('planCreditsRow') as HTMLElement).hidden).toBe(false);
    expect((document.getElementById('usageHistoryCard') as HTMLElement).hidden).toBe(false);
    expect(document.getElementById('planPlansButton')?.textContent).toBe('Compare plans');
  });
});
