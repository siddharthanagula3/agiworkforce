// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ONBOARDING_COMPLETE_KEY,
  ONBOARDING_DISCLOSURES_KEY,
  PIN_PROMPT_DISMISSED_KEY,
  SIDE_PANEL_TOUR_DONE_KEY,
  disclosureVersion,
  isOnboardingCurrent,
  markOnboardingComplete,
  boundShortcuts,
  onboardingPromptKind,
} from '../src/features/side-panel/onboarding';
import { mountOnboardingPrompt } from '../src/features/side-panel/onboardingPrompt';
import {
  buildWelcomePage,
  type WelcomeDependencies,
} from '../src/features/onboarding/welcome-page';
import { DATA_HANDLING_DISCLOSURES } from '../src/features/privacy/dataHandling';
import { createTaskNotifier } from '../src/background/task-notifications';

function chromeWith(store: Record<string, unknown>, pinned: boolean | Error = true) {
  vi.stubGlobal('chrome', {
    i18n: { getMessage: (key: string) => key, getUILanguage: () => 'en' },
    runtime: { lastError: null },
    storage: {
      local: {
        get: (defaults: Record<string, unknown>, cb: (items: Record<string, unknown>) => void) =>
          cb(
            Object.fromEntries(
              Object.keys(defaults).map((k) => [k, k in store ? store[k] : defaults[k]]),
            ),
          ),
        set: (items: Record<string, unknown>) => {
          Object.assign(store, items);
          return Promise.resolve();
        },
      },
    },
    action: {
      getUserSettings: () =>
        pinned instanceof Error ? Promise.reject(pinned) : Promise.resolve({ isOnToolbar: pinned }),
    },
  });
}

const flush = async (): Promise<void> => {
  await new Promise((resolveTimer) => setTimeout(resolveTimer, 0));
};

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('onboarding state', () => {
  it('records the disclosure version with the completion flag', () => {
    const store: Record<string, unknown> = {};
    chromeWith(store);
    markOnboardingComplete();
    expect(store[ONBOARDING_COMPLETE_KEY]).toBe(true);
    expect(store[ONBOARDING_DISCLOSURES_KEY]).toBe(disclosureVersion());
  });

  it('changes the version when the data handling text changes', () => {
    const changed = DATA_HANDLING_DISCLOSURES.map((entry, index) =>
      index === 0 ? { ...entry, body: `${entry.body} More.` } : entry,
    );
    expect(disclosureVersion(changed)).not.toBe(disclosureVersion());
  });

  it('asks for a review again after a disclosure change, and not before', async () => {
    const store: Record<string, unknown> = {};
    chromeWith(store);
    expect(await isOnboardingCurrent()).toBe(false);
    markOnboardingComplete('old');
    expect(await isOnboardingCurrent('old')).toBe(true);
    expect(await onboardingPromptKind('new')).toBe('review');
  });

  it('prompts to pin only when reviewed, not on the toolbar and not dismissed', async () => {
    const reviewed = {
      [ONBOARDING_COMPLETE_KEY]: true,
      [ONBOARDING_DISCLOSURES_KEY]: disclosureVersion(),
      [SIDE_PANEL_TOUR_DONE_KEY]: true,
    };
    chromeWith({ ...reviewed }, false);
    expect(await onboardingPromptKind()).toBe('pin');
    chromeWith({ ...reviewed, [PIN_PROMPT_DISMISSED_KEY]: true }, false);
    expect(await onboardingPromptKind()).toBeNull();
    chromeWith({ ...reviewed }, true);
    expect(await onboardingPromptKind()).toBeNull();
    chromeWith({ ...reviewed }, new Error('unsupported'));
    expect(await onboardingPromptKind()).toBeNull();
  });
});

describe('side panel tour', () => {
  const reviewed = {
    [ONBOARDING_COMPLETE_KEY]: true,
    [ONBOARDING_DISCLOSURES_KEY]: disclosureVersion(),
  };

  it('is offered once after the review and before the pin prompt', async () => {
    const store: Record<string, unknown> = { ...reviewed };
    chromeWith(store, false);
    expect(await onboardingPromptKind()).toBe('tour');
    store[SIDE_PANEL_TOUR_DONE_KEY] = true;
    expect(await onboardingPromptKind()).toBe('pin');
  });

  it('moves from tab access to the bound shortcuts and finishes once', async () => {
    chromeWith({});
    const finishTour = vi.fn();
    const prompt = mountOnboardingPrompt(document.createElement('div'), {
      kind: async () => 'tour',
      openWelcome: vi.fn(),
      dismissPin: vi.fn(),
      finishTour,
      shortcuts: async () => ({ open: 'Command+Shift+K', capture: 'Command+Shift+Y' }),
    });
    await prompt.shown;
    const [action] = prompt.element.querySelectorAll('button');
    expect(action!.textContent).toBe('obTourNext');
    action!.click();
    await flush();
    expect(action!.textContent).toBe('obTourFinish');
    expect(prompt.element.classList.contains('visible')).toBe(true);
    expect(finishTour).not.toHaveBeenCalled();
    action!.click();
    expect(finishTour).toHaveBeenCalledOnce();
    expect(prompt.element.classList.contains('visible')).toBe(false);
  });

  it('reads the real shortcuts from Chrome and tolerates their absence', async () => {
    vi.stubGlobal('chrome', {
      commands: {
        getAll: async () => [
          { name: '_execute_action', shortcut: 'Alt+Shift+K' },
          { name: 'capture_page', shortcut: '' },
        ],
      },
    });
    expect(await boundShortcuts()).toEqual({ open: 'Alt+Shift+K', capture: '' });
    vi.stubGlobal('chrome', {});
    expect(await boundShortcuts()).toEqual({ open: '', capture: '' });
  });
});

describe('slim onboarding prompt', () => {
  beforeEach(() => chromeWith({}));

  it('shows nothing when there is nothing to ask', async () => {
    const parent = document.createElement('div');
    const prompt = mountOnboardingPrompt(parent, {
      kind: async () => null,
      openWelcome: vi.fn(),
      dismissPin: vi.fn(),
    });
    await prompt.shown;
    expect(prompt.element.classList.contains('visible')).toBe(false);
  });

  it('sends a first-run or changed-disclosure user to the welcome page', async () => {
    const parent = document.createElement('div');
    const openWelcome = vi.fn();
    const prompt = mountOnboardingPrompt(parent, {
      kind: async () => 'review',
      openWelcome,
      dismissPin: vi.fn(),
    });
    await prompt.shown;
    expect(prompt.element.classList.contains('visible')).toBe(true);
    const [action, dismiss] = prompt.element.querySelectorAll('button');
    expect(dismiss!.hidden).toBe(true);
    action!.click();
    expect(openWelcome).toHaveBeenCalledOnce();
    expect(prompt.element.classList.contains('visible')).toBe(false);
  });

  it('remembers Not now for the pin prompt and gives a visible name equal to the accessible one', async () => {
    const parent = document.createElement('div');
    const dismissPin = vi.fn();
    const prompt = mountOnboardingPrompt(parent, {
      kind: async () => 'pin',
      openWelcome: vi.fn(),
      dismissPin,
    });
    await prompt.shown;
    for (const button of prompt.element.querySelectorAll('button')) {
      expect(button.hasAttribute('aria-label')).toBe(false);
    }
    prompt.element.querySelectorAll('button')[1]!.click();
    expect(dismissPin).toHaveBeenCalledOnce();
  });

  it('is a slim notice, not a modal', async () => {
    const parent = document.createElement('div');
    const prompt = mountOnboardingPrompt(parent, {
      kind: async () => 'pin',
      openWelcome: vi.fn(),
      dismissPin: vi.fn(),
    });
    await prompt.shown;
    expect(prompt.element.getAttribute('role')).toBe('note');
    expect(prompt.element.getAttribute('aria-modal')).toBeNull();
    expect(parent.firstElementChild).toBe(prompt.element);
  });
});

describe('welcome page', () => {
  function deps(overrides: Partial<WelcomeDependencies> = {}): WelcomeDependencies {
    return {
      isSignedIn: async () => false,
      signIn: vi.fn(async () => undefined),
      isPinned: async () => false,
      openSidePanel: vi.fn(async () => undefined),
      openSettings: vi.fn(),
      acknowledge: vi.fn(),
      ...overrides,
    };
  }

  beforeEach(() => chromeWith({}));

  it('lists every data handling disclosure the panel used to show', async () => {
    const page = buildWelcomePage(deps());
    await page.loaded;
    document.body.appendChild(page.element);
    const labels = [...page.element.querySelectorAll('.wl-details summary')].map(
      (n) => n.textContent,
    );
    expect(labels).toEqual(DATA_HANDLING_DISCLOSURES.map((entry) => entry.label));
  });

  it('shows the sign-in button until the person is signed in', async () => {
    const signedOut = buildWelcomePage(deps());
    await signedOut.loaded;
    expect(signedOut.element.querySelector<HTMLButtonElement>('.wl-btn-secondary')!.hidden).toBe(
      false,
    );
    const signedIn = buildWelcomePage(deps({ isSignedIn: async () => true }));
    await signedIn.loaded;
    expect(signedIn.element.querySelector<HTMLButtonElement>('.wl-btn-secondary')!.hidden).toBe(
      true,
    );
    expect(signedIn.element.textContent).toContain('welcomeSignedIn');
  });

  it('acknowledges before opening the side panel, and says so when Chrome refuses', async () => {
    const order: string[] = [];
    const page = buildWelcomePage(
      deps({
        acknowledge: () => order.push('ack'),
        openSidePanel: async () => {
          order.push('open');
          throw new Error('needs a gesture');
        },
      }),
    );
    await page.loaded;
    page.element.querySelector<HTMLButtonElement>('.wl-btn-primary')!.click();
    await flush();
    expect(order).toEqual(['ack', 'open']);
    expect(page.element.textContent).toContain('welcomeTryFailed');
  });

  it('keeps the injection warning with a link to the security page', async () => {
    const page = buildWelcomePage(deps());
    await page.loaded;
    expect(page.element.querySelector<HTMLAnchorElement>('.wl-warning a')!.href).toMatch(
      /\/security$/,
    );
  });
});

describe('install lifecycle', () => {
  const background = readFileSync(resolve(__dirname, '../src/background.ts'), 'utf8');

  it('opens the welcome page on install and not on update', () => {
    const listener = background.slice(background.indexOf('chrome.runtime.onInstalled.addListener'));
    expect(listener).toMatch(/details\.reason === 'install'[\s\S]{0,200}WELCOME_PAGE_PATH/);
  });

  it('builds the welcome page as a bundle input and copies its html', () => {
    const vite = readFileSync(resolve(__dirname, '../vite.config.ts'), 'utf8');
    expect(vite).toContain("welcome: resolve(__dirname, 'src/welcome.ts')");
    expect(vite).toContain("{ src: 'src/welcome.html', dest: 'src' }");
  });
});

describe('task notifier', () => {
  beforeEach(() => chromeWith({}));

  function setup(over: { enabled?: boolean; looking?: boolean } = {}) {
    const show = vi.fn();
    const notify = createTaskNotifier<string>({
      isEnabled: async () => over.enabled ?? true,
      isUserLooking: async () => over.looking ?? false,
      show,
    });
    return { show, notify };
  }

  it('notifies with fixed copy and links the conversation', async () => {
    const { show, notify } = setup();
    await expect(notify('finished', { conversationId: 'c1', owner: 'o' })).resolves.toBe(true);
    expect(show).toHaveBeenCalledWith(
      'notifyTaskFinishedTitle',
      'notifyTaskFinishedBody',
      'c1',
      'o',
    );
  });

  it('uses distinct copy for failure and for waiting on approval', async () => {
    const { show, notify } = setup();
    await notify('failed');
    await notify('needs-input');
    expect(show.mock.calls.map((call) => call[0])).toEqual([
      'notifyTaskFailedTitle',
      'notifyTaskInputTitle',
    ]);
  });

  it('stays silent when the toggle is off', async () => {
    const { show, notify } = setup({ enabled: false });
    await expect(notify('finished')).resolves.toBe(false);
    expect(show).not.toHaveBeenCalled();
  });

  it('stays silent while the person is looking at the panel', async () => {
    const { show, notify } = setup({ looking: true });
    await expect(notify('needs-input')).resolves.toBe(false);
    expect(show).not.toHaveBeenCalled();
  });
});
