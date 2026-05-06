/**
 * advancedFeatures.ts — Validation + status-bar surface for non-default features
 * (inline completions, MCP, desktop bridge).
 *
 * Extracted from `extension.ts` (~95 LOC) per A1 decomposition.
 */

import * as vscode from 'vscode';
import { Config } from '../utils/config';
import { getApiKey } from '../utils/api';
import { getDesktopBridge } from '../services/desktopBridge';

export async function validateAdvancedFeatureFlags(
  context: vscode.ExtensionContext,
): Promise<void> {
  const inlineEnabled = Config.inlineCompletionsEnabled();
  const mcpEnabled = Config.mcpEnabled();
  const desktopBridgeEnabled = Config.desktopBridgeEnabled();
  const desktopBridgePort = Config.desktopBridgePort();

  if (inlineEnabled) {
    const hasApiKey = (await getApiKey(context.secrets)) !== undefined;
    if (!hasApiKey) {
      void vscode.window
        .showInformationMessage(
          'AGI Workforce inline completions are enabled, but no API key is configured.',
          'Set API Key',
        )
        .then((choice) => {
          if (choice === 'Set API Key') {
            void vscode.commands.executeCommand('agi-workforce.setApiKey');
          }
        });
    }
  }

  if (mcpEnabled && !desktopBridgeEnabled) {
    void vscode.window.showWarningMessage(
      'AGI Workforce MCP is enabled, but desktop bridge is disabled. Enable desktop bridge to use local MCP tools.',
    );
  }

  if (desktopBridgeEnabled) {
    // Show a live status bar item instead of a one-shot warning so it clears
    // automatically when the bridge reconnects.
    updateBridgeReachabilityStatus(context, desktopBridgePort);
  } else {
    // Bridge disabled — clear any existing reachability item
    clearBridgeReachabilityStatus();
  }
}

// ─── Bridge reachability status bar item ─────────────────────────────────────

let _bridgeStatusItem: vscode.StatusBarItem | undefined;
let _bridgeReachabilityDisposable: vscode.Disposable | undefined;

export function clearBridgeReachabilityStatus(): void {
  _bridgeStatusItem?.dispose();
  _bridgeStatusItem = undefined;
  _bridgeReachabilityDisposable?.dispose();
  _bridgeReachabilityDisposable = undefined;
}

export function updateBridgeReachabilityStatus(
  context: vscode.ExtensionContext,
  port: number,
): void {
  // Re-create item if port changed or first time
  if (_bridgeStatusItem === undefined) {
    _bridgeStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
    _bridgeStatusItem.command = 'agi-workforce.syncContextToDesktop';
    context.subscriptions.push(_bridgeStatusItem);
  }

  const bridge = getDesktopBridge();

  const refresh = (): void => {
    if (_bridgeStatusItem === undefined) return;
    const currentBridge = getDesktopBridge();
    if (currentBridge === undefined) {
      _bridgeStatusItem.text = '$(warning) AGI Bridge: offline';
      _bridgeStatusItem.tooltip = `Desktop bridge not reachable on localhost:${port}. Start the AGI Workforce desktop app.`;
      _bridgeStatusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      _bridgeStatusItem.show();
    } else if (currentBridge.status === 'connected') {
      _bridgeStatusItem.text = '$(plug) AGI Bridge: connected';
      _bridgeStatusItem.tooltip = `Desktop bridge connected on localhost:${port}`;
      _bridgeStatusItem.backgroundColor = undefined;
      _bridgeStatusItem.show();
    } else if (currentBridge.status === 'connecting') {
      _bridgeStatusItem.text = '$(sync~spin) AGI Bridge: connecting…';
      _bridgeStatusItem.tooltip = `Connecting to desktop bridge on localhost:${port}`;
      _bridgeStatusItem.backgroundColor = undefined;
      _bridgeStatusItem.show();
    } else {
      _bridgeStatusItem.text = '$(warning) AGI Bridge: offline';
      _bridgeStatusItem.tooltip = `Desktop bridge not reachable on localhost:${port}. Start the AGI Workforce desktop app.`;
      _bridgeStatusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      _bridgeStatusItem.show();
    }
  };

  // Subscribe to status changes so the item auto-clears on reconnect
  _bridgeReachabilityDisposable?.dispose();
  if (bridge !== undefined) {
    _bridgeReachabilityDisposable = bridge.onStatusChange(() => refresh());
    context.subscriptions.push(_bridgeReachabilityDisposable);
  }

  refresh();
}
