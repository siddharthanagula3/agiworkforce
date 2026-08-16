
import * as fs from 'node:fs';
import * as path from 'node:path';

export function resolveScreenDir(subdir: string, envVar = 'AGI_SWEEP_SCREEN_DIR'): string {
  const base = process.env[envVar] ?? path.join(process.cwd(), 'wdio', 'screenshots');
  const dir = path.join(base, subdir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function clickSelector(selector: string): Promise<void> {
  return browser.execute((sel) => {
    (document.querySelector(sel) as HTMLElement | null)?.click();
  }, selector) as Promise<void>;
}

export function waitForSelector(
  selector: string,
  timeoutMs = 15_000,
  mode: 'appear' | 'disappear' = 'appear',
): Promise<boolean> {
  return browser.execute(
    (sel, timeout, m) =>
      new Promise((resolve) => {
        const start = Date.now();
        const tick = () => {
          const found = !!document.querySelector(sel);
          const ok = m === 'appear' ? found : !found;
          if (ok) return resolve(true);
          if (Date.now() - start > timeout) return resolve(false);
          setTimeout(tick, 120);
        };
        tick();
      }),
    selector,
    timeoutMs,
    mode,
  ) as unknown as Promise<boolean>;
}

export function clickButtonWithText(
  containerSelector: string,
  text: string,
  match: 'exact' | 'prefix' = 'exact',
): Promise<boolean> {
  return browser.execute(
    (containerSel, label, mode) => {
      const container = document.querySelector(containerSel) ?? document;
      const buttons = Array.from(container.querySelectorAll('button'));
      const hit = buttons.find((b) => {
        const value = (b.textContent ?? '').trim();
        return mode === 'exact' ? value === label : value.startsWith(label);
      });
      if (hit) {
        (hit as HTMLButtonElement).click();
        return true;
      }
      return false;
    },
    containerSelector,
    text,
    match,
  ) as Promise<boolean>;
}

export type ClickTarget = {
  navId?: string;
  ariaLabel?: string;
  title?: string;
  text?: string;
  selector?: string;
  within?: string;
};

export type SweepExpectation = {
  testId?: string;
  textPattern?: string;
  dialog?: boolean;
  selectorPresent?: string;
  forbidTestId?: string;
};

export type SweepStepResult = {
  label: string;
  clicked: boolean;
  clickedVia: string | null;
  passed: boolean;
  forbiddenPresent: boolean;
  toasts: string[];
  deadControlToasts: string[];
  errorBoundary: string | null;
  rawKeys: string[];
  visibleTestIds: string[];
  documentAlive: boolean;
  elapsedMs: number;
};

export const DEAD_CONTROL_TOAST =
  /coming soon|not available|will be available|requires the desktop app|not implemented|unavailable/i;

const RAW_KEY_SHAPE = /^[a-z][a-zA-Z]*(\.[a-z][a-zA-Z0-9_]*)+$/;
const DOMAIN_LIKE = /\.(com|org|net|io|dev|app|ai|md|json|ts|tsx|js|rs|html|css|toml)$/i;

type Observation = {
  satisfied: boolean;
  forbiddenPresent: boolean;
  toasts: string[];
  errorBoundary: string | null;
  rawKeys: string[];
  visibleTestIds: string[];
  documentAlive: boolean;
};

function clickTarget(target: ClickTarget): Promise<{ clicked: boolean; via: string | null }> {
  return browser.execute((t: ClickTarget) => {
    const esc = (value: string) => value.replace(/["\\]/g, '\\$&');
    let element: HTMLElement | null = null;
    let via: string | null = null;

    if (t.navId) {
      element = document.querySelector(`[data-nav-id="${esc(t.navId)}"]`);
      if (element) via = `navId=${t.navId}`;
    }
    if (!element && t.ariaLabel) {
      element = document.querySelector(`[aria-label="${esc(t.ariaLabel)}"]`);
      if (element) via = `ariaLabel=${t.ariaLabel}`;
    }
    if (!element && t.title) {
      element = document.querySelector(`[title="${esc(t.title)}"]`);
      if (element) via = `title=${t.title}`;
    }
    if (!element && t.text) {
      const scope = t.within ? (document.querySelector(t.within) ?? document) : document;
      const buttons = Array.from(scope.querySelectorAll('button'));
      const wanted = t.text;
      const exact = buttons.find((b) => (b.textContent ?? '').trim() === wanted);
      const prefixed = buttons.find((b) => (b.textContent ?? '').trim().startsWith(wanted));
      element = ((exact ?? prefixed) as HTMLElement) ?? null;
      if (element) via = `text=${wanted}${exact ? '' : ' (prefix)'}`;
    }
    if (!element && t.selector) {
      element = document.querySelector(t.selector);
      if (element) via = `selector=${t.selector}`;
    }

    if (!element) return { clicked: false, via: null };
    element.click();
    return { clicked: true, via };
  }, target) as unknown as Promise<{ clicked: boolean; via: string | null }>;
}

function observe(expectation: SweepExpectation): Promise<Observation> {
  return browser.execute(
    (exp: SweepExpectation, rawKeySource: string, domainSource: string) => {
      const esc = (value: string) => value.replace(/["\\]/g, '\\$&');
      const rawKeyShape = new RegExp(rawKeySource);
      const domainLike = new RegExp(domainSource, 'i');

      const panelRoot =
        (document.querySelector('[data-v3-shell] > div:last-child') as HTMLElement | null) ??
        document.body;

      const dialogVisible = Array.from(
        document.querySelectorAll('[role="dialog"], [role="alertdialog"]'),
      ).some((d) => (d as HTMLElement).getClientRects().length > 0);

      let satisfied = !!(exp.dialog || exp.testId || exp.textPattern || exp.selectorPresent);
      if (exp.dialog && !dialogVisible) satisfied = false;
      if (exp.selectorPresent && !document.querySelector(exp.selectorPresent)) satisfied = false;
      if (exp.testId) {
        const el = document.querySelector(`[data-testid="${esc(exp.testId)}"]`);
        if (!el || (el as HTMLElement).getClientRects().length === 0) satisfied = false;
      }
      if (exp.textPattern) {
        const text = (panelRoot.textContent ?? '').replace(/\s+/g, ' ');
        if (!new RegExp(exp.textPattern, 'i').test(text)) satisfied = false;
      }

      const toasts = Array.from(
        document.querySelectorAll('[data-sonner-toast], [role="alert"], [role="status"]'),
      )
        .map((n) => (n.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200))
        .filter(Boolean);

      const panelText = (panelRoot.textContent ?? '').replace(/\s+/g, ' ').trim();
      const boundary = panelText.match(
        /(encountered an unexpected error|Something went wrong|Application error)[^.]{0,120}/i,
      );

      const rawKeys = new Set<string>();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const parent = walker.currentNode.parentElement;
        if (!parent || parent.closest('code, pre, script, style, textarea')) continue;
        const value = (walker.currentNode.textContent ?? '').trim();
        if (!value || value.length > 80) continue;
        if (rawKeyShape.test(value) && !domainLike.test(value)) rawKeys.add(value);
      }

      return {
        satisfied,
        forbiddenPresent: exp.forbidTestId
          ? !!document.querySelector(`[data-testid="${esc(exp.forbidTestId)}"]`)
          : false,
        toasts,
        errorBoundary: boundary ? boundary[0] : null,
        rawKeys: Array.from(rawKeys).sort(),
        visibleTestIds: Array.from(document.querySelectorAll('[data-testid]'))
          .map((el) => el.getAttribute('data-testid') ?? '')
          .filter(Boolean)
          .filter((v, i, a) => a.indexOf(v) === i)
          .sort(),
        documentAlive:
          !!document.querySelector('[data-v3-shell], [role="dialog"]') ||
          (document.body.textContent ?? '').trim().length > 0,
      };
    },
    expectation,
    RAW_KEY_SHAPE.source,
    DOMAIN_LIKE.source,
  ) as unknown as Promise<Observation>;
}

export async function sweepStep(
  label: string,
  click: ClickTarget,
  expectation: SweepExpectation = {},
  maxLooks = 4,
): Promise<SweepStepResult> {
  const startedAt = Date.now();
  const { clicked, via } = await clickTarget(click);

  const toasts = new Set<string>();
  let last: Observation | null = null;

  for (let look = 0; look < maxLooks; look += 1) {
    if (look > 0) await browser.pause(600);
    last = await observe(expectation);
    for (const toast of last.toasts) toasts.add(toast);
    if (last.satisfied) break;
  }

  const observation: Observation = last ?? {
    satisfied: false,
    forbiddenPresent: false,
    toasts: [],
    errorBoundary: null,
    rawKeys: [],
    visibleTestIds: [],
    documentAlive: false,
  };
  const allToasts = Array.from(toasts);

  return {
    label,
    clicked,
    clickedVia: via,
    passed: clicked && observation.satisfied,
    forbiddenPresent: observation.forbiddenPresent,
    toasts: allToasts,
    deadControlToasts: allToasts.filter((t) => DEAD_CONTROL_TOAST.test(t)),
    errorBoundary: observation.errorBoundary,
    rawKeys: observation.rawKeys,
    visibleTestIds: observation.visibleTestIds,
    documentAlive: observation.documentAlive,
    elapsedMs: Date.now() - startedAt,
  };
}

export function collectRawKeys(): Promise<string[]> {
  return browser.execute(
    (rawKeySource: string, domainSource: string) => {
      const shape = new RegExp(rawKeySource);
      const domain = new RegExp(domainSource, 'i');
      const offenders = new Set<string>();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const parent = walker.currentNode.parentElement;
        if (!parent || parent.closest('code, pre, script, style, textarea')) continue;
        const text = (walker.currentNode.textContent ?? '').trim();
        if (!text || text.length > 80) continue;
        if (shape.test(text) && !domain.test(text)) offenders.add(text);
      }
      return Array.from(offenders).sort();
    },
    RAW_KEY_SHAPE.source,
    DOMAIN_LIKE.source,
  ) as Promise<string[]>;
}

export function listNavIds(): Promise<string[]> {
  return browser.execute(() =>
    Array.from(document.querySelectorAll('[data-nav-id]')).map(
      (el) => el.getAttribute('data-nav-id') ?? '',
    ),
  ) as Promise<string[]>;
}
