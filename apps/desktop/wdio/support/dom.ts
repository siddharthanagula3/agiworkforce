/**
 * In-page DOM helpers shared by the native WDIO specs.
 *
 * WHY THESE RUN IN THE PAGE, NOT THROUGH THE DRIVER
 * Every discrete WebdriverIO command against the embedded Tauri driver pays a
 * fixed ~5-6s tax (measured and documented in conversation-actions.spec.ts).
 * A sweep expressed as `$(sel).click()` + `waitForDisplayed()` per control
 * costs minutes per control; the same work expressed as ONE `browser.execute()`
 * that clicks and then polls inside the page costs one round trip. Screenshots
 * and real keyboard input are the only things that must stay on the driver.
 *
 * `clickSelector`, `waitForSelector`, and `clickButtonWithText` were duplicated
 * (with drifting behaviour) across sidebar-navigation, settings-tour,
 * cloud-settings-tour, and others. They are promoted here verbatim-compatible
 * with the strictest existing variants:
 *  - clickButtonWithText matches on exact trimmed text by default (the
 *    sidebar-navigation variant) with an opt-in prefix mode (the settings-tour
 *    variant, needed because a settings nav button carries a badge suffix).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── screenshot destination ───────────────────────────────────────────────────

/**
 * Resolve a screenshot directory.
 *
 * Specs used to hardcode absolute paths into per-session scratchpad dirs
 * (`/private/tmp/claude-501/<session-uuid>/scratchpad/...`). Those sessions
 * expire, so on any later run `browser.saveScreenshot()` wrote into a directory
 * nobody would ever look at — the evidence the spec claims to capture was
 * silently lost. Resolve from an env var, else a repo-local path that is
 * gitignored.
 */
export function resolveScreenDir(subdir: string, envVar = 'AGI_SWEEP_SCREEN_DIR'): string {
  const base = process.env[envVar] ?? path.join(process.cwd(), 'wdio', 'screenshots');
  const dir = path.join(base, subdir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── primitive in-page actions ────────────────────────────────────────────────

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

// ─── sweep step ───────────────────────────────────────────────────────────────

/** How to find the control to click. Resolved in the order the fields appear. */
export type ClickTarget = {
  /** `[data-nav-id="…"]` — expanded sidebar nav buttons. */
  navId?: string;
  /** `[aria-label="…"]` — the settings gear, new-project, collapse toggle. */
  ariaLabel?: string;
  /** `[title="…"]` — collapsed rail buttons carry only a title. */
  title?: string;
  /**
   * Trimmed button text. Matched exactly first, then by prefix — the sidebar's
   * Search button renders its shortcut badge inside the same button, so its
   * textContent is `Search⌘K`, and an exact-only match silently finds nothing.
   */
  text?: string;
  /** Raw CSS selector escape hatch. */
  selector?: string;
  /** Container selector for `text`. Defaults to the document. */
  within?: string;
};

export type SweepExpectation = {
  /** `[data-testid="…"]` that proves the intended panel rendered. */
  testId?: string;
  /**
   * Regex source matched against the panel's visible text. Use for panels that
   * ship no testid of their own (e.g. the local Agent Tasks panel).
   */
  textPattern?: string;
  /** A visible `[role=dialog]` is the expectation (settings, search, ⌘K). */
  dialog?: boolean;
  /**
   * Any CSS selector that must match. Needed for panels identified by an
   * attribute rather than text or a testid — the chat panel, for instance, is
   * only recognisable by its composer's aria-label, which `textPattern` (which
   * reads textContent) can never see.
   */
  selectorPresent?: string;
  /**
   * `[data-testid="…"]` that must NOT be present. DesktopShellV3's panel
   * ternary ends in a bare `else` rendering AgiWorkProjects, so an unwired nav
   * click still renders SOMETHING: `agi-work-projects` showing up when it was
   * not the target is the signature of a dead control, not a pass.
   */
  forbidTestId?: string;
};

export type SweepStepResult = {
  label: string;
  /** False when no element matched the ClickTarget at all. */
  clicked: boolean;
  /** Which ClickTarget field resolved the element. */
  clickedVia: string | null;
  /** The expectation was satisfied within the budget. */
  passed: boolean;
  /** The forbidden testid was present when the budget expired. */
  forbiddenPresent: boolean;
  /** Sonner/aria-live text observed at any point during the poll. */
  toasts: string[];
  /** Toast text matching the dead-control vocabulary. */
  deadControlToasts: string[];
  /** Error-boundary copy found in the panel region. */
  errorBoundary: string | null;
  /** Raw i18n keys visible anywhere in the document during the poll. */
  rawKeys: string[];
  /** All `[data-testid]` values present when the poll ended — triage aid. */
  visibleTestIds: string[];
  /**
   * False when the WebView rendered nothing at all. Distinguishes "the app
   * died" from "this one control is missing" — see the Observation docs.
   */
  documentAlive: boolean;
  elapsedMs: number;
};

/**
 * A control that answers a click with "coming soon" is dead, not wired. Also
 * catches the desktop-only upsell copy leaking into the desktop app itself.
 */
export const DEAD_CONTROL_TOAST =
  /coming soon|not available|will be available|requires the desktop app|not implemented|unavailable/i;

/**
 * Raw-key shape borrowed from i18n-raw-keys.spec.ts: dotted lowerCamel
 * segments, no digits/slashes/spaces, excluding domain- and filename-like text.
 */
const RAW_KEY_SHAPE = /^[a-z][a-zA-Z]*(\.[a-z][a-zA-Z0-9_]*)+$/;
const DOMAIN_LIKE = /\.(com|org|net|io|dev|app|ai|md|json|ts|tsx|js|rs|html|css|toml)$/i;

/**
/**
 * Everything one observation round trip reports about the page.
 *
 * `documentAlive` exists because the 2026-08-04 run found the WebView going
 * completely BLANK mid-sweep (empty body, zero `[data-testid]`, byte-identical
 * screenshots from that point on). Without this field every later step reported
 * "control not found", which reads as nine dead controls when the truth is one
 * dead webview. A blank document must be distinguishable from a missing button.
 */
type Observation = {
  satisfied: boolean;
  forbiddenPresent: boolean;
  toasts: string[];
  errorBoundary: string | null;
  rawKeys: string[];
  visibleTestIds: string[];
  documentAlive: boolean;
};

/**
 * Resolve and click one control. Returns immediately — no polling, no promise.
 *
 * WHY THIS IS NOT ONE BIG IN-PAGE POLL (the obvious, cheaper design):
 * `browser.execute` against the embedded Tauri driver is `execute/sync`, and
 * this driver does NOT await a returned Promise. A poll expressed as
 * `new Promise(resolve => { const tick = () => ... })` therefore hangs until
 * the driver's 30s script timeout, retries twice, and kills the test at 90s —
 * and, measured on 2026-08-04, leaves the WebView blank for every subsequent
 * step. Polling has to happen on the driver side, one `execute` per look.
 */
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

/** One synchronous look at the page. Never polls, never returns a promise. */
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
        // A live shell always has the sidebar plus some body text.
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

/**
 * Click one control, then look at the page until it settles or the budget runs
 * out. Toast text is UNIONED across looks: sonner auto-dismisses after ~4s, so
 * a single end-of-poll read misses exactly the "coming soon" toast this sweep
 * exists to catch.
 */
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
    // React needs a beat to commit; lazy panels need a beat to resolve.
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

/** Raw i18n keys visible right now — used to baseline pre-existing offenders. */
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

/** Every `[data-nav-id]` currently rendered, in DOM order. */
export function listNavIds(): Promise<string[]> {
  return browser.execute(() =>
    Array.from(document.querySelectorAll('[data-nav-id]')).map(
      (el) => el.getAttribute('data-nav-id') ?? '',
    ),
  ) as Promise<string[]>;
}
