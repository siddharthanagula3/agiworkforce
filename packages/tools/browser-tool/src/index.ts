/**
 * @agiworkforce/browser-tool
 *
 * Minimal agent-controlled browser tool, built fresh on `playwright-core`.
 *
 * One tool, one schema (discriminated-union on `action.kind`), ten actions:
 *   navigate, click, clickCoords, type, press, screenshot, snapshot, wait,
 *   evaluate, close.
 *
 * Profile management is isolated by design: every action targets a named
 * profile under `~/.agiworkforce/browser/profiles/<name>` (default
 * `agiworkforce`). The agent NEVER touches the user's daily Chrome
 * profile, that was the whole bet OpenClaw made on this surface.
 *
 * Schema patterns lifted from OpenClaw's `extensions/browser/` (lessons,
 * not code): flat discriminated union (Vertex-AI compatible),
 * `aria` vs `ai` snapshot modes, `ref`-based element targeting, and the
 * stale-ref recovery loop the agent should use (re-snapshot on miss).
 *
 * # Security: `evaluate` action gate
 *
 * The `evaluate` action runs LLM-supplied JavaScript inside the persistent
 * browser context. Because that context retains cookies / localStorage for
 * every site the agent has ever navigated to, an `evaluate` script can
 * exfiltrate session credentials with a single `fetch()`. To prevent that,
 * `evaluate` is **disabled by default**. Callers who genuinely need it
 * must construct the runner with `allowEvaluate: true` AND apply their own
 * caller-side approval / allow-list / domain check. Without the flag, an
 * `evaluate` action returns an error result (`isError: true`) and never
 * touches the page.
 *
 * What this package does NOT do (vs OpenClaw's full `extensions/browser/`):
 *   - No HTTP control service / Express server (you call `runBrowserAction`
 *     directly from the gateway / app)
 *   - No multi-profile dialog / file-chooser arming
 *   - No Chrome MCP stdio mode (we use Playwright directly)
 *   - No PDF generation (use `printToPDF` via CDP if needed; not exposed here)
 *
 * Those are future-sprint additions.
 *
 * @packageDocumentation
 */

import { closeProfile, openProfile } from './profile';
import { clearSnapshotRefs, resolveRef, takeSnapshot } from './snapshot';
import type { ComputerAction } from '@agiworkforce/types';
import type { BrowserAction, BrowserToolResult, BrowserSnapshot } from './types';

export class BrowserToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrowserToolError';
  }
}

const ALLOWED_NAVIGATE_SCHEMES = new Set(['http:', 'https:']);

export type {
  BrowserAction,
  BrowserToolResult,
  BrowserSnapshot,
  BrowserProfileInfo,
  BrowserSnapshotMode,
  BrowserSnapshotElement,
} from './types';
export { listProfiles, resolveProfileDir, closeProfile, closeAllProfiles } from './profile';
export { BrowserProfileNameError } from './profile';

/**
 * Configuration for {@link runBrowserAction}.
 *
 * Hand-passed by the caller per invocation (the runner is stateless w.r.t.
 * config). Field defaults are conservative, secure-by-default.
 */
export interface BrowserToolConfig {
  allowEvaluate?: boolean;
}

export interface ComputerActionBrowserConfig extends BrowserToolConfig {
  defaultProfile?: string;
}

export type ComputerActionBrowserMapping =
  | { ok: true; action: BrowserAction }
  | { ok: false; reason: string };

export function computerActionToBrowserAction(
  action: ComputerAction,
  config: ComputerActionBrowserConfig = {},
): ComputerActionBrowserMapping {
  const profile = stringArg(action, 'profile') ?? config.defaultProfile;

  switch (action.kind) {
    case 'open_url': {
      const url = stringArg(action, 'url') ?? action.target;
      if (!url) return unsupportedComputerAction(action, 'missing target URL');
      return {
        ok: true,
        action: { kind: 'navigate', url, profile, waitFor: waitForArg(action) },
      };
    }
    case 'click': {
      const ref = stringArg(action, 'ref') ?? action.target;
      if (ref) {
        return {
          ok: true,
          action: { kind: 'click', ref, profile, button: buttonArg(action) },
        };
      }

      const x = numberArg(action, 'x');
      const y = numberArg(action, 'y');
      if (x !== undefined && y !== undefined) {
        return { ok: true, action: { kind: 'clickCoords', x, y, profile } };
      }

      return unsupportedComputerAction(action, 'missing target ref or x/y coordinates');
    }
    case 'type_text': {
      const ref = stringArg(action, 'ref') ?? action.target;
      const text = stringArg(action, 'text') ?? stringArg(action, 'value');
      if (!ref) return unsupportedComputerAction(action, 'missing target ref');
      if (text === undefined) return unsupportedComputerAction(action, 'missing text argument');
      return {
        ok: true,
        action: { kind: 'type', ref, text, profile, submit: boolArg(action, 'submit') },
      };
    }
    case 'press_key': {
      const key = stringArg(action, 'key') ?? action.target;
      if (!key) return unsupportedComputerAction(action, 'missing key argument');
      return { ok: true, action: { kind: 'press', key, profile } };
    }
    case 'screenshot':
      return {
        ok: true,
        action: { kind: 'screenshot', profile, fullPage: boolArg(action, 'fullPage') },
      };
    case 'scroll':
    case 'drag':
    case 'download_file':
    case 'approve_tool':
    case 'reject_tool':
      return unsupportedComputerAction(
        action,
        'action requires a native desktop, extension, or approval runner',
      );
  }
}

export async function runComputerAction(
  action: ComputerAction,
  config: ComputerActionBrowserConfig = {},
): Promise<BrowserToolResult> {
  if (!isRunnableComputerAction(action)) {
    return errorResult(
      `ComputerAction ${action.id} is not runnable from status "${action.status}"` +
        (action.requiresApproval ? ' without approval' : ''),
    );
  }

  const mapped = computerActionToBrowserAction(action, config);
  if (!mapped.ok) return errorResult(mapped.reason);

  const result = await runBrowserAction(mapped.action, config);
  return {
    ...result,
    details: {
      ...(result.details ?? {}),
      computerAction: {
        id: action.id,
        sessionId: action.sessionId,
        kind: action.kind,
      },
    },
  };
}

/**
 * Execute a single browser action. The caller owns the lifecycle.
 * call `closeAllProfiles()` on shutdown to release any persistent contexts.
 *
 * @param action The action to perform.
 * @param config Optional config (gate `evaluate`, etc.). See
 *   {@link BrowserToolConfig}. Defaults are secure-by-default.
 */
export async function runBrowserAction(
  action: BrowserAction,
  config: BrowserToolConfig = {},
): Promise<BrowserToolResult> {
  const profileName = (('profile' in action && action.profile) || 'agiworkforce') as string;

  try {
    switch (action.kind) {
      case 'navigate': {
        const page = await openProfile(profileName);
        clearSnapshotRefs(profileName);
        const waitUntil = action.waitFor ?? 'load';
        let parsedScheme: string;
        try {
          parsedScheme = new URL(action.url).protocol;
        } catch {
          throw new BrowserToolError('Refusing to navigate to malformed URL');
        }
        if (!ALLOWED_NAVIGATE_SCHEMES.has(parsedScheme)) {
          throw new BrowserToolError('Refusing to navigate to non-HTTPS scheme: ' + parsedScheme);
        }
        await page.goto(action.url, { waitUntil });
        const url = page.url();
        const title = await page.title().catch(() => '');
        return {
          content: [{ type: 'text', text: `Navigated to ${url} ("${title}")` }],
          details: { url, title },
        };
      }
      case 'click': {
        const page = await openProfile(profileName);
        const locator = resolveRef(profileName, action.ref);
        if (!locator) {
          return errorResult(
            `Unknown ref "${action.ref}", call action: snapshot first to refresh refs.`,
          );
        }
        await locator.click({ button: action.button ?? 'left' });
        clearSnapshotRefs(profileName);
        return {
          content: [{ type: 'text', text: `Clicked ${action.ref}` }],
          details: { ref: action.ref, url: page.url() },
        };
      }
      case 'clickCoords': {
        const page = await openProfile(profileName);
        await page.mouse.click(action.x, action.y);
        clearSnapshotRefs(profileName);
        return {
          content: [{ type: 'text', text: `Clicked at (${action.x}, ${action.y})` }],
          details: { x: action.x, y: action.y, url: page.url() },
        };
      }
      case 'type': {
        const page = await openProfile(profileName);
        const locator = resolveRef(profileName, action.ref);
        if (!locator) {
          return errorResult(
            `Unknown ref "${action.ref}", call action: snapshot first to refresh refs.`,
          );
        }
        await locator.fill(action.text);
        if (action.submit) {
          await locator.press('Enter');
        }
        clearSnapshotRefs(profileName);
        return {
          content: [
            {
              type: 'text',
              text: `Typed ${action.text.length} chars into ${action.ref}${
                action.submit ? ' and pressed Enter' : ''
              }`,
            },
          ],
          details: { ref: action.ref, length: action.text.length, url: page.url() },
        };
      }
      case 'press': {
        const page = await openProfile(profileName);
        await page.keyboard.press(action.key);
        clearSnapshotRefs(profileName);
        return {
          content: [{ type: 'text', text: `Pressed ${action.key}` }],
          details: { key: action.key, url: page.url() },
        };
      }
      case 'screenshot': {
        const page = await openProfile(profileName);
        const buf = await page.screenshot({ fullPage: action.fullPage ?? false, type: 'png' });
        const data = Buffer.from(buf).toString('base64');
        return {
          content: [{ type: 'image', data, mimeType: 'image/png' }],
          details: { url: page.url(), bytes: buf.byteLength },
        };
      }
      case 'snapshot': {
        const page = await openProfile(profileName);
        const snap: BrowserSnapshot = await takeSnapshot(page, profileName, action.mode ?? 'aria');
        return {
          content: [{ type: 'text', text: formatSnapshot(snap) }],
          details: snap as unknown as Record<string, unknown>,
        };
      }
      case 'wait': {
        await new Promise((resolve) => setTimeout(resolve, action.ms));
        return {
          content: [{ type: 'text', text: `Waited ${action.ms}ms` }],
        };
      }
      case 'evaluate': {
        if (!config.allowEvaluate) {
          return errorResult(
            "browser-tool: 'evaluate' action is disabled by default. " +
              'Set allowEvaluate: true at runner construction to enable. ' +
              'Note: enabling without an allow-list / domain block is a ' +
              'credential-theft surface, see runBrowserAction docs.',
          );
        }
        const page = await openProfile(profileName);
        const result = await page.evaluate(action.script);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          details: { url: page.url() },
        };
      }
      case 'close': {
        await closeProfile(profileName);
        return {
          content: [{ type: 'text', text: `Closed profile ${profileName}` }],
          details: { profile: profileName },
        };
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResult(message);
  }
}

function errorResult(message: string): BrowserToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
  };
}

function unsupportedComputerAction(
  action: ComputerAction,
  reason: string,
): ComputerActionBrowserMapping {
  return {
    ok: false,
    reason: `ComputerAction "${action.kind}" cannot run in browser-tool: ${reason}`,
  };
}

function isRunnableComputerAction(action: ComputerAction): boolean {
  if (action.status === 'completed' || action.status === 'failed' || action.status === 'rejected') {
    return false;
  }

  if (!action.requiresApproval) return true;
  return action.status === 'approved' || action.status === 'running';
}

function stringArg(action: ComputerAction, key: string): string | undefined {
  const value = action.args?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function numberArg(action: ComputerAction, key: string): number | undefined {
  const value = action.args?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function boolArg(action: ComputerAction, key: string): boolean | undefined {
  const value = action.args?.[key];
  return typeof value === 'boolean' ? value : undefined;
}

function buttonArg(action: ComputerAction): 'left' | 'right' | 'middle' | undefined {
  const value = stringArg(action, 'button');
  if (value === 'left' || value === 'right' || value === 'middle') return value;
  return undefined;
}

function waitForArg(
  action: ComputerAction,
): 'load' | 'domcontentloaded' | 'networkidle' | undefined {
  const value = stringArg(action, 'waitFor');
  if (value === 'load' || value === 'domcontentloaded' || value === 'networkidle') return value;
  return undefined;
}

function formatSnapshot(snap: BrowserSnapshot): string {
  const lines = [`URL: ${snap.url}`, `Title: ${snap.title}`, `Elements (${snap.elements.length}):`];
  for (const el of snap.elements) {
    const name = el.name ? ` "${el.name}"` : '';
    const level = el.level !== undefined ? ` h${el.level}` : '';
    lines.push(`  [${el.ref}] ${el.role}${name}${level}`);
  }
  return lines.join('\n');
}
