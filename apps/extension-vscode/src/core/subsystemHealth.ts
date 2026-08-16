
import * as vscode from 'vscode';
import { t } from '../l10n';

interface FailureRecord {
  subsystem: string;
  message: string;
  recordedAt: number;
}

const failures: FailureRecord[] = [];
let statusBarItem: vscode.StatusBarItem | undefined;
let detailCommandRegistered = false;

const SHOW_DETAIL_COMMAND = 'agi-workforce.showSubsystemHealth';

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

export function runBoot(subsystem: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    recordFailure(subsystem, err);
  }
}

export async function runBootAsync(subsystem: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    recordFailure(subsystem, err);
  }
}

export function recordFailure(subsystem: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  failures.push({ subsystem, message, recordedAt: Date.now() });
  console.warn(`[AGI Workforce] subsystem '${subsystem}' failed: ${message}`);
  refresh();
}

export function getFailureCount(): number {
  return failures.length;
}

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
      ? `$(warning) ${t('subsystemHealth.oneUnavailable', { subsystem: failures[0]?.subsystem ?? 'subsystem' })}`
      : `$(warning) ${t('subsystemHealth.manyUnavailable', { count: failures.length })}`;
  statusBarItem.tooltip = t('subsystemHealth.detailsTooltip');
  statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  statusBarItem.show();
}

async function showFailureDetail(): Promise<void> {
  if (failures.length === 0) {
    void vscode.window.showInformationMessage(t('subsystemHealth.allHealthy'));
    return;
  }
  const items: vscode.QuickPickItem[] = failures.map((f) => ({
    label: f.subsystem,
    description: new Date(f.recordedAt).toLocaleTimeString(),
    detail: f.message,
  }));
  await vscode.window.showQuickPick(items, {
    title: t('subsystemHealth.failuresTitle'),
    placeHolder: t('subsystemHealth.failuresPlaceholder'),
  });
}
