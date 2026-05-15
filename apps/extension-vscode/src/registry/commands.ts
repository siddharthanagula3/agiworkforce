/**
 * commands.ts — Centralized command registry (A2 pattern).
 *
 * The previous shape registered 45+ commands inline in `extension.ts activate()`,
 * each as an anonymous lambda closing over local activation state. Two problems:
 *   1. `activate()` ballooned to ~1,000 LOC of unreviewable diff surface.
 *   2. There was no single list to compare against `package.json` — a command
 *      declared in package.json could silently lose its handler in a refactor
 *      and we wouldn't notice until a user clicked it.
 *
 * This module provides the framework. Each command is a `{ id, handler }`
 * pair; `registerCommands` registers all of them and returns the disposables.
 * The `parity` test (`__tests__/commandParity.test.ts`) asserts every
 * package.json `contributes.commands[].command` is registered at runtime.
 *
 * Migration strategy: new commands ship via this registry. Old inline
 * commands in `extension.ts` get pulled into here incrementally — the parity
 * test catches any drop-the-handler regression before it ships.
 */

import * as vscode from 'vscode';

/**
 * Dependencies passed to every command handler. Add fields here when a new
 * command needs access to state owned by `extension.ts activate()`.
 *
 * Avoid stuffing every internal here — prefer exposing narrow accessor
 * functions through a service module so command bodies stay testable.
 */
export interface CommandDeps {
  context: vscode.ExtensionContext;
}

export interface Command {
  /** Must match a `contributes.commands[].command` in package.json. */
  id: string;
  /** Returns the handler to register; receives shared activation state. */
  handler: (deps: CommandDeps) => (...args: unknown[]) => Promise<unknown> | unknown;
}

/**
 * Register a list of commands. Returns disposables for every one — caller
 * is responsible for pushing them onto `context.subscriptions`.
 */
export function registerCommands(
  deps: CommandDeps,
  commands: readonly Command[],
): vscode.Disposable[] {
  return commands.map((cmd) =>
    vscode.commands.registerCommand(cmd.id, cmd.handler(deps) as (...args: unknown[]) => unknown),
  );
}

/**
 * The canonical list of registry-owned commands. New commands go here.
 * Old commands in `extension.ts` migrate over incrementally — when they do,
 * the parity test catches any handler that goes missing.
 *
 * Keep this list grouped + alphabetized within group for diff review.
 *
 * NOTE: agi-workforce.showSubsystemHealth is NOT listed here. Its handler
 * lives in services/subsystemHealth.ts and is registered by initSubsystemHealth().
 * Adding a dummy stub here would cause a double-registration when both paths run.
 */
export const REGISTRY_COMMANDS: readonly Command[] = [];
