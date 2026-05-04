/**
 * @agiworkforce/browser-tool
 *
 * Minimal agent-controlled browser tool, built fresh on `playwright-core`.
 *
 * One tool, one schema (discriminated-union on `action.kind`), six actions:
 *   navigate, click, clickCoords, type, press, screenshot, snapshot, wait,
 *   evaluate, close.
 *
 * Profile management is isolated by design: every action targets a named
 * profile under `~/.agiworkforce/browser/profiles/<name>` (default
 * `agiworkforce`). The agent NEVER touches the user's daily Chrome
 * profile — that was the whole bet OpenClaw made on this surface.
 *
 * Schema patterns lifted from OpenClaw's `extensions/browser/` (lessons,
 * not code): flat discriminated union (Vertex-AI compatible),
 * `aria` vs `ai` snapshot modes, `ref`-based element targeting, and the
 * stale-ref recovery loop the agent should use (re-snapshot on miss).
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
import type { BrowserAction, BrowserToolResult, BrowserSnapshot } from './types';

export type {
  BrowserAction,
  BrowserToolResult,
  BrowserSnapshot,
  BrowserProfileInfo,
  BrowserSnapshotMode,
  BrowserSnapshotElement,
} from './types';
export { listProfiles, resolveProfileDir, closeProfile, closeAllProfiles } from './profile';

/**
 * Execute a single browser action. The caller owns the lifecycle —
 * call `closeAllProfiles()` on shutdown to release any persistent contexts.
 */
export async function runBrowserAction(action: BrowserAction): Promise<BrowserToolResult> {
  const profileName = (('profile' in action && action.profile) || 'agiworkforce') as string;

  try {
    switch (action.kind) {
      case 'navigate': {
        const page = await openProfile(profileName);
        clearSnapshotRefs(profileName);
        const waitUntil = action.waitFor ?? 'load';
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
            `Unknown ref "${action.ref}" — call action: snapshot first to refresh refs.`,
          );
        }
        await locator.click({ button: action.button ?? 'left' });
        clearSnapshotRefs(profileName); // page state may have changed
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
            `Unknown ref "${action.ref}" — call action: snapshot first to refresh refs.`,
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

function formatSnapshot(snap: BrowserSnapshot): string {
  const lines = [`URL: ${snap.url}`, `Title: ${snap.title}`, `Elements (${snap.elements.length}):`];
  for (const el of snap.elements) {
    const name = el.name ? ` "${el.name}"` : '';
    const level = el.level !== undefined ? ` h${el.level}` : '';
    lines.push(`  [${el.ref}] ${el.role}${name}${level}`);
  }
  return lines.join('\n');
}
