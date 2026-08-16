
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

interface IpcCheckOptions {
  srcDir: string;
  srcTauriDir: string;
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
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const next = lines[j] ?? '';
          const m = PUB_FN_RE.exec(next);
          if (m && m[1]) {
            known.add(m[1]);
            break;
          }
          if (next.trim() !== '' && !next.trim().startsWith('#[')) {
            break;
          }
        }
      }
    }
  }
  return known;
}

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
        throw new Error(report);
      }
      console.warn(report);
    },
  };
}
