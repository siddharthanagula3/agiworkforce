/**
 * Vite plugin: ipc-check
 *
 * Wave 2 Task 2.1, Stream 2 — drift detection at build time.
 *
 * On `buildStart`, this plugin scans every `invoke('<name>', ...)` literal
 * in `apps/desktop/src/**\/*.{ts,tsx}` and confirms the command is registered
 * as a `#[tauri::command]` somewhere under `apps/desktop/src-tauri/src/`.
 *
 * Why a Vite plugin in addition to `check-wiring.sh`?
 *   - The shell script is the CI guard (Stream 1).
 *   - This plugin gives the same signal at local `pnpm build` time, with
 *     line-accurate locations and closest-match suggestions.
 *
 * Behaviour:
 *   - Default mode: WARN. Prints a single grouped report at the end of the
 *     scan and lets the build continue.
 *   - Strict mode: opt in via `{ failOnDrift: true }`. Throws after the
 *     report so the build aborts.
 *
 * The default of WARN is a deliberate choice for this sprint:
 *   1. Per project memory (FIX-023), 20 frontend `invoke('...')` calls
 *      currently reference nonexistent backend commands. They predate this
 *      plugin and are being cleaned up incrementally.
 *   2. Failing builds today would block everyone until that backlog is
 *      resolved. CI's `check-wiring.sh` step (Stream 1) already protects
 *      *new* drift via the `set -e` exit code from the script.
 *   3. Once the existing 20 unknowns are either implemented or annotated
 *      with `// @ipc-skip`, flip `failOnDrift: true` in vite.config.ts and
 *      drop this comment.
 *
 * Escape hatch:
 *   Add `// @ipc-skip` on the same line as an `invoke('...')` call to
 *   suppress this plugin for that single call site (e.g. invoke targets
 *   that are routed through `tauri-mock.ts`'s cloud-web fallthrough and
 *   never reach Rust).
 *
 * Implementation notes:
 *   - Uses regex (not AST) for portability — keeps the plugin
 *     dependency-free. Aligns with the matching pattern used by
 *     `apps/desktop/check-wiring.sh`.
 *   - The set of `#[tauri::command]` definitions is collected once per
 *     buildStart, not per file, to keep the cost roughly O(N) in the
 *     number of frontend source files rather than O(N*M).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

interface IpcCheckOptions {
  /** Absolute path to apps/desktop/src */
  srcDir: string;
  /** Absolute path to apps/desktop/src-tauri/src */
  srcTauriDir: string;
  /**
   * If true, throw after the report so the build aborts.
   * Default: false (warn only — see plugin header for rationale).
   */
  failOnDrift?: boolean;
}

interface InvokeSite {
  command: string;
  file: string;
  line: number;
}

const INVOKE_LITERAL_RE = /\binvoke\(\s*['"]([a-z_][a-z0-9_]*)['"]/g;
const TAURI_COMMAND_RE = /^\s*#\[tauri::command(?:\([^)]*\))?\]\s*$/;
const PUB_FN_RE = /^\s*pub\s+(?:async\s+)?fn\s+([a-z_][a-z0-9_]*)/;
const SKIP_MARKER = '@ipc-skip';

async function walk(dir: string, ext: ReadonlySet<string>): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === 'dist') {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(full, ext)));
    } else if (ext.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

async function collectInvokeSites(srcDir: string): Promise<InvokeSite[]> {
  const sites: InvokeSite[] = [];
  const files = await walk(srcDir, new Set(['.ts', '.tsx']));
  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      if (line.includes(SKIP_MARKER)) {
        continue;
      }
      // Reset regex lastIndex per line
      INVOKE_LITERAL_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = INVOKE_LITERAL_RE.exec(line)) !== null) {
        const command = match[1];
        if (command) {
          sites.push({ command, file, line: i + 1 });
        }
      }
    }
  }
  return sites;
}

async function collectTauriCommands(srcTauriDir: string): Promise<Set<string>> {
  const known = new Set<string>();
  const files = await walk(srcTauriDir, new Set(['.rs']));
  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length - 1; i++) {
      if (TAURI_COMMAND_RE.test(lines[i] ?? '')) {
        // Walk forward over zero or more attribute / blank lines until we find
        // the `pub fn` line (cargo allows e.g. #[allow(...)] between
        // #[tauri::command] and the fn signature).
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const next = lines[j] ?? '';
          const m = PUB_FN_RE.exec(next);
          if (m && m[1]) {
            known.add(m[1]);
            break;
          }
          // Stop scanning if we hit a non-attribute, non-blank line that
          // isn't a pub fn (defensive — shouldn't happen in practice).
          if (next.trim() !== '' && !next.trim().startsWith('#[')) {
            break;
          }
        }
      }
    }
  }
  return known;
}

/** Levenshtein distance for closest-match suggestions. */
function distance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev: number[] = new Array(b.length + 1);
  const curr: number[] = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min((curr[j - 1] ?? 0) + 1, (prev[j] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j] ?? 0;
  }
  return prev[b.length] ?? 0;
}

function suggestClosest(unknown: string, known: Set<string>, limit = 3): string[] {
  const scored = Array.from(known)
    .map((cmd) => ({ cmd, d: distance(unknown, cmd) }))
    .filter(({ d }) => d <= Math.max(3, Math.floor(unknown.length / 3)))
    .sort((a, b) => a.d - b.d);
  return scored.slice(0, limit).map((entry) => entry.cmd);
}

export function ipcCheckPlugin(options: IpcCheckOptions): Plugin {
  const failOnDrift = options.failOnDrift ?? false;
  let ranOnce = false;
  return {
    name: 'agiworkforce:ipc-check',
    enforce: 'pre',
    async buildStart() {
      // Vite calls buildStart on every dev-server restart too; only run once
      // per process to keep HMR fast.
      if (ranOnce) return;
      ranOnce = true;

      let invokeSites: InvokeSite[];
      let knownCommands: Set<string>;
      try {
        [invokeSites, knownCommands] = await Promise.all([
          collectInvokeSites(options.srcDir),
          collectTauriCommands(options.srcTauriDir),
        ]);
      } catch (err) {
        // Don't break the build if the plugin itself crashes — just warn.
        console.warn(`[ipc-check] skipped: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }

      const unknownByCommand = new Map<string, InvokeSite[]>();
      for (const site of invokeSites) {
        if (!knownCommands.has(site.command)) {
          const list = unknownByCommand.get(site.command) ?? [];
          list.push(site);
          unknownByCommand.set(site.command, list);
        }
      }

      // eslint-disable-next-line no-console
      console.log(
        `[ipc-check] scanned ${invokeSites.length} invoke() call(s) against ` +
          `${knownCommands.size} #[tauri::command] definition(s).`,
      );

      if (unknownByCommand.size === 0) {
        // eslint-disable-next-line no-console
        console.log('[ipc-check] OK: every invoke() resolves to a registered command.');
        return;
      }

      const lines: string[] = [
        `[ipc-check] ${unknownByCommand.size} unknown invoke target(s) found:`,
      ];
      const sortedUnknowns = Array.from(unknownByCommand.entries()).sort((a, b) =>
        a[0].localeCompare(b[0]),
      );
      for (const [command, sites] of sortedUnknowns) {
        const closest = suggestClosest(command, knownCommands);
        const closestHint = closest.length > 0 ? ` (closest: ${closest.join(', ')})` : '';
        lines.push(`  - invoke('${command}')${closestHint}`);
        for (const site of sites.slice(0, 3)) {
          const rel = path.relative(options.srcDir, site.file);
          lines.push(`      at src/${rel}:${site.line}`);
        }
        if (sites.length > 3) {
          lines.push(`      (+${sites.length - 3} more call site(s))`);
        }
      }
      lines.push(
        '  Hint: register the command via #[tauri::command] in src-tauri/, ' +
          'add it to generate_handler! in lib.rs, or annotate the call ' +
          'site with `// @ipc-skip`.',
      );
      const report = lines.join('\n');

      if (failOnDrift) {
        // Throwing inside buildStart fails the build with a clean message.
        throw new Error(report);
      }
      console.warn(report);
    },
  };
}
