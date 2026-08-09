import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Tauri event contract.
 *
 * A `listen('x')` whose name nothing emits is silent: no type error, no runtime
 * warning, just a panel that never updates. This test is the only thing that
 * notices, so it reads both sides out of source rather than trusting a
 * hand-maintained list.
 */

const DESKTOP_ROOT = resolve(__dirname, '../..');
const FRONTEND_ROOT = join(DESKTOP_ROOT, 'src');
const RUST_ROOT = join(DESKTOP_ROOT, 'src-tauri/src');

function collectFiles(dir: string, extensions: string[]): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'target' || entry === 'dist') continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...collectFiles(path, extensions));
    else if (extensions.some((ext) => path.endsWith(ext))) found.push(path);
  }
  return found;
}

// `listen` must be followed immediately by `(` or a generic argument — a bare
// `listen` in prose ("listen for output") would otherwise match the next call.
const LISTEN_PATTERN = /\blisten(?:<[\s\S]{0,400}?>)?\(\s*(['"])([^'"]+)\1/g;

// Covers `app.emit("x", …)`, the plugin variants, and the module-local
// `emit_event` / `emit_scheduler_event` helpers that take the handle first.
const EMIT_PATTERN =
  /(?:\.emit(?:_all|_to|_filter)?|emit_event|emit_scheduler_event|emit_to_frontend)\s*\(\s*(?:&?[A-Za-z_][\w.]*\s*,\s*)?"([^"]+)"/g;

function listenedEvents(): Map<string, string[]> {
  const events = new Map<string, string[]>();
  for (const file of collectFiles(FRONTEND_ROOT, ['.ts', '.tsx'])) {
    if (file.includes('__tests__')) continue;
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(LISTEN_PATTERN)) {
      const name = match[2];
      const sites = events.get(name) ?? [];
      sites.push(file.slice(DESKTOP_ROOT.length + 1));
      events.set(name, sites);
    }
  }
  return events;
}

function emittedEvents(): Set<string> {
  const events = new Set<string>();
  for (const file of collectFiles(RUST_ROOT, ['.rs'])) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(EMIT_PATTERN)) events.add(match[1]);
  }
  return events;
}

/**
 * Names that are legitimately listened for without a Rust emitter in this
 * repository. Every entry needs a reason; nothing lands here to silence a
 * failure. Entries are tolerated, never required — a plan item that adds the
 * missing emitter does not break this test.
 */
const UNEMITTED_BY_DESIGN: Record<string, string> = {
  // Emitted by the updater plugin inside Tauri itself, not by our crate.
  'tauri://update-download-progress': 'tauri-plugin-updater',
  'tauri://update-downloaded': 'tauri-plugin-updater',
  'tauri://update-error': 'tauri-plugin-updater',

  // Known-open gaps owned by other ExecutionPlan items. Listed so this test
  // still guards everything else instead of being deleted wholesale.
  'agi:browser_action': 'no browser-automation event source exists yet',
  'agi:file_changed': 'file edits ship as agi:file_operation; consumer not migrated',
  'agi:goal_completed': 'chat agent workflow events (agentWorkflowEvents.ts)',
  'agi:step_completed': 'chat agent workflow events (agentWorkflowEvents.ts)',
  'approval:request': 'chat agent workflow events (agentWorkflowEvents.ts)',
  'extension:disabled': 'browser-extension settings surface',
  'extension:enabled': 'browser-extension settings surface',
  'extension:install_completed': 'browser-extension settings surface',
  'extension:install_failed': 'browser-extension settings surface',
  'extension:install_progress': 'browser-extension settings surface',
  'extension:uninstalled': 'browser-extension settings surface',
  'mcp:connection_changed': 'MCP lifecycle events (useAgenticEvents.ts)',
  'mcp:system_initialized': 'MCP lifecycle events (useAgenticEvents.ts)',
  'mcp:tool_execution_completed': 'MCP lifecycle events (useAgenticEvents.ts)',
  'mcp:tool_execution_started': 'MCP lifecycle events (useAgenticEvents.ts)',
  'mcp:tools_updated': 'MCP lifecycle events (useAgenticEvents.ts)',
};

describe('Tauri event contract', () => {
  const listened = listenedEvents();
  const emitted = emittedEvents();

  it('extracts both sides of the contract', () => {
    // Guards the regexes: a rename that breaks extraction would otherwise make
    // every assertion below vacuously pass.
    expect(listened.size).toBeGreaterThan(50);
    expect(emitted.size).toBeGreaterThan(50);
  });

  it('has a Rust emitter for every event the UI listens for', () => {
    const orphans = [...listened.entries()]
      .filter(([name]) => !emitted.has(name) && !(name in UNEMITTED_BY_DESIGN))
      .map(([name, sites]) => `${name} (${sites.join(', ')})`);

    expect(orphans).toEqual([]);
  });

  it('keeps the tolerated-gap list free of stale entries', () => {
    const stale = Object.keys(UNEMITTED_BY_DESIGN).filter((name) => !listened.has(name));

    expect(stale).toEqual([]);
  });

  describe('surfaces repaired by ExecutionPlan #40', () => {
    const repaired = [
      // Agent collaboration panel <- SwarmOrchestrator
      'swarm:started',
      'swarm:subtask_started',
      'swarm:subtask_completed',
      'swarm:subtask_failed',
      'swarm:completed',
      // Scheduler store <- sys/commands/scheduler.rs
      'scheduler:job_added',
      'scheduler:job_removed',
      'scheduler:job_updated',
      'scheduler:job_executed',
      'scheduler:error',
      // Execution store <- llm_executor.rs / tool_stream.rs / frontend_events.rs
      'llm:stream_chunk',
      'agi:tool_stream',
      'agi:terminal_command',
      // Computer-use store <- frontend_events.rs
      'agi:screenshot',
    ];

    it.each(repaired)('%s is both listened for and emitted', (name) => {
      expect(listened.has(name)).toBe(true);
      expect(emitted.has(name)).toBe(true);
    });

    it('drops the event names Rust never emitted', () => {
      const retired = [
        'swarm:progress',
        'swarm:agent_message',
        'swarm:complete',
        'agi:llm_chunk',
        'agi:llm_complete',
        'agi:terminal_output',
        'computer_use:screenshot',
      ];

      expect(retired.filter((name) => listened.has(name))).toEqual([]);
    });
  });
});
