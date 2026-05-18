/**
 * subsystemHealth.ts — Surface subsystem activation failures to the user.
 *
 * `extension.ts activate()` historically wrapped each subsystem boot in a
 * try/catch with `console.warn`. Failures were invisible — telemetry/desktop
 * bridge/checkpoint manager could fail and the user wouldn't know why a
 * dependent feature didn't work.
 *
 * This module records each failure and surfaces a status-bar item:
 *   "AGI: ⚠ 2 subsystems"
 * Clicking opens a quick-pick listing the failed subsystems with their error
 * messages. Healthy state shows nothing (no clutter).
 */

import * as vscode from 'vscode';

interface FailureRecord {
  subsystem: string;
  message: string;
  recordedAt: number;
}

const failures: FailureRecord[] = [];
let statusBarItem: vscode.StatusBarItem | undefined;
let detailCommandRegistered = false;

const SHOW_DETAIL_COMMAND = 'agi-workforce.showSubsystemHealth';

/** Initialize the status-bar slot. Call once during activate(). */
export function initSubsystemHealth(context: vscode.ExtensionContext): void {
  if (statusBarItem === undefined) {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 88);
    statusBarItem.command = SHOW_DETAIL_COMMAND;
    context.subscriptions.push(statusBarItem);
  }
  if (!detailCommandRegistered) {
    context.subscriptions.push(
      vscode.commands.registerCommand(SHOW_DETAIL_COMMAND, showFailureDetail),
    );
    detailCommandRegistered = true;
  }
  refresh();
}

/**
 * Run a subsystem boot inside a try/catch. On failure, record + surface,
 * but never let the error escape to the activate() flow (telemetry boot
 * failure must not block the rest of the extension).
 */
export function runBoot(subsystem: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    recordFailure(subsystem, err);
  }
}

/** Async variant of runBoot. */
export async function runBootAsync(subsystem: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    recordFailure(subsystem, err);
  }
}

/** Manually record a failure. Useful when the failure path is not a thrown error. */
export function recordFailure(subsystem: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  failures.push({ subsystem, message, recordedAt: Date.now() });
  console.warn(`[AGI Workforce] subsystem '${subsystem}' failed: ${message}`);
  refresh();
}

/** Test-only inspector. */
export function getFailureCount(): number {
  return failures.length;
}

/** Test-only reset. */
export function __resetSubsystemHealthForTests(): void {
  failures.length = 0;
  statusBarItem?.dispose();
  statusBarItem = undefined;
  detailCommandRegistered = false;
}

function refresh(): void {
  if (statusBarItem === undefined) return;
  if (failures.length === 0) {
    statusBarItem.hide();
    return;
  }
  statusBarItem.text =
    failures.length === 1
      ? `$(warning) AGI: ${failures[0]?.subsystem ?? 'subsystem'} unavailable`
      : `$(warning) AGI: ${failures.length} subsystems unavailable`;
  statusBarItem.tooltip = 'Click for details';
  statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  statusBarItem.show();
}

async function showFailureDetail(): Promise<void> {
  if (failures.length === 0) {
    void vscode.window.showInformationMessage('AGI Workforce: all subsystems healthy.');
    return;
  }
  const items: vscode.QuickPickItem[] = failures.map((f) => ({
    label: f.subsystem,
    description: new Date(f.recordedAt).toLocaleTimeString(),
    detail: f.message,
  }));
  await vscode.window.showQuickPick(items, {
    title: 'AGI Workforce — Subsystem Failures',
    placeHolder: 'Failures recorded during this session',
  });
}
