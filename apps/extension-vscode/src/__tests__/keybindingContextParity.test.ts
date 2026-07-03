/**
 * keybindingContextParity.test.ts — dead-keybinding guard.
 *
 * `contributes.keybindings[].when` clauses can reference two kinds of context
 * keys:
 *   1. Custom `agi-workforce.*` keys this extension owns and must set itself
 *      via `vscode.commands.executeCommand('setContext', key, value)`.
 *   2. VS Code built-in keys (e.g. `focusedView`, `activeWebviewPanelId`,
 *      `editorTextFocus`) that the host sets automatically.
 *
 * A custom `agi-workforce.*` key that is referenced in a `when` clause but
 * never set anywhere in `src/` makes the whole clause permanently false —
 * the keybinding is silently dead (it never fires, with no error surfaced
 * anywhere). This regressed once: `agi-workforce.sidebarFocus` /
 * `agi-workforce.chatFocus` were added to gate the Shift+Tab "Cycle Agent
 * Mode" binding but were never wired to `setContext`, so the binding could
 * never trigger. Fixed by switching to the built-in `focusedView` /
 * `activeWebviewPanelId` contexts, which VS Code sets automatically for our
 * own sidebar webview view (`agi-workforce.sidebar`) and chat-in-editor
 * webview panel (`agi-workforce.chatPanel`) respectively.
 *
 * This test asserts every custom `agi-workforce.*` context key referenced in
 * a keybinding `when` clause is set somewhere in `src/` via `setContext`.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

interface PkgKeybinding {
  command: string;
  key?: string;
  mac?: string;
  when?: string;
}

const PKG_PATH = path.resolve(__dirname, '../../package.json');
const SRC_ROOT = path.resolve(__dirname, '..');

function readKeybindings(): PkgKeybinding[] {
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8')) as {
    contributes?: { keybindings?: PkgKeybinding[] };
  };
  return pkg.contributes?.keybindings ?? [];
}

/**
 * Extract every `agi-workforce.<...>` identifier referenced in a `when`
 * clause as a standalone boolean context flag (e.g. `agi-workforce.hasDiff`
 * or `!agi-workforce.hasDiff`). Excludes occurrences that are string-literal
 * comparison values (e.g. `focusedView == 'agi-workforce.sidebar'`) — those
 * are built-in VS Code context keys compared against one of OUR view/panel
 * ids, not a custom flag we need to set ourselves.
 */
function extractCustomContextKeys(when: string): string[] {
  const matches = when.match(/(?<!['"])agi-workforce\.[a-zA-Z0-9.]+(?!['"])/g) ?? [];
  return matches;
}

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectSourceFiles(full));
    } else if (entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

function collectSetContextKeys(): Set<string> {
  const keys = new Set<string>();
  for (const file of collectSourceFiles(SRC_ROOT)) {
    const content = fs.readFileSync(file, 'utf8');
    const re = /setContext['"]?\s*,\s*['"](agi-workforce\.[a-zA-Z0-9.]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      keys.add(m[1] as string);
    }
  }
  return keys;
}

describe('keybinding when-clause context parity', () => {
  it('every custom agi-workforce.* context key in a keybinding when-clause is set via setContext somewhere', () => {
    const keybindings = readKeybindings();
    expect(keybindings.length).toBeGreaterThan(0);

    const setKeys = collectSetContextKeys();

    const unwired: string[] = [];
    for (const kb of keybindings) {
      if (!kb.when) continue;
      for (const key of extractCustomContextKeys(kb.when)) {
        // `agi-workforce.hasDiff`, etc. are command ids too (e.g.
        // `agi-workforce.acceptDiff`) when they appear as `!agi-workforce.foo`
        // negation targets used purely as flags — only flag keys that look
        // like context flags (no further dots after the key segment beyond
        // the namespace), matching the shape actually used by this codebase.
        if (!setKeys.has(key)) {
          unwired.push(`${key} (keybinding: ${kb.command}, when: "${kb.when}")`);
        }
      }
    }

    expect(
      unwired,
      `Found keybinding when-clause(s) referencing an agi-workforce.* context key that is never ` +
        `set via setContext anywhere in src/ — the keybinding can never fire:\n${unwired.join('\n')}`,
    ).toEqual([]);
  });
});
