/**
 * extension.ts — AGI Workforce VS Code Extension entry point
 *
 * Activated on startup (activationEvents: ["onStartupFinished"]).
 * Orchestrates lifecycle setup via the lifecycle/ modules.
 */

import * as vscode from 'vscode';
import { Config } from './platform/config';
import { activateDesktopBridge } from './features/desktop-bridge';
import { initModelMetrics } from './features/model-picker/modelMetrics';
import { normalizeConfiguredModelId } from './features/model-picker/modelConstants';
import { initSubsystemHealth, runBoot, recordFailure } from './core/subsystemHealth';
import { validateAdvancedFeatureFlags } from './core/advancedFeatures';
import { buildExtensionStatusBarText } from './core/statusBar';
import { setupChat } from './core/chatSetup';
import { setupProviders } from './core/providerSetup';
import { setupCommands } from './core/commandSetup';
import * as telemetry from './core/telemetry';
import { LocalRuntimeClient } from './integrations/localRuntimeClient';
import { LocalRuntimePool } from './integrations/localRuntimePool';
import { refreshAccountTierCache } from './integrations/tierResolver';
import { getExtensionVersion } from './platform/version';
import {
  initializeAgentModeConsent,
  reconcileAgentControlConsent,
} from './features/permissions/agentModeConsent';

// ─── Activation ───────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  initializeAgentModeConsent(context);

  // ── 0. Subsystem health (must be first) ─────────────────────────────────────
  initSubsystemHealth(context);

  // ── 0a. Telemetry ────────────────────────────────────────────────────────────
  runBoot('telemetry', () => {
    context.subscriptions.push(telemetry.activate(context));
  });

  // ── 0b. Model Metrics ────────────────────────────────────────────────────────
  runBoot('model-metrics', () => {
    initModelMetrics(context);
  });

  // ── 0c. Desktop Bridge ───────────────────────────────────────────────────────
  try {
    context.subscriptions.push(activateDesktopBridge(context));
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    recordFailure('desktop-bridge', err);
    vscode.window.showWarningMessage(
      `AGI Workforce: Desktop bridge failed to initialize — ${errMsg}. ` +
        'Some features may be unavailable.',
    );
  }

  // ── 1. Code intelligence + diff + inline completion providers ────────────────
  // Runs before chat setup so diffDecorationProvider is available for the sidebar.
  const providerState = setupProviders(context);
  const {
    diffDecorationProvider,
    diagnosticsProvider,
    syncCodeLensProvider,
    syncInlineCompletionProvider,
  } = providerState;

  // One Rust app-server per workspace root. The pool is lazy, so activation
  // never launches a process until a local developer session is actually used.
  const localRuntimes = new LocalRuntimePool(
    (cwd) =>
      new LocalRuntimeClient({
        cliPath: Config.cliPath(),
        cwd,
        clientVersion: getExtensionVersion(),
      }),
  );
  context.subscriptions.push(localRuntimes);

  // ── 2. Chat participant + sidebar + conversation tree + context tree ─────────
  const chatState = setupChat(context, localRuntimes, diffDecorationProvider);
  const {
    sidebarProvider,
    conversationTreeProvider,
    contextPanelProvider,
    memoryTreeProvider,
    nativeChatAvailable,
  } = chatState;

  // ── 3. Commands ──────────────────────────────────────────────────────────────
  setupCommands(context, {
    sidebarProvider,
    conversationTreeProvider,
    localRuntimes,
    contextPanelProvider,
    memoryTreeProvider,
    diffDecorationProvider,
    diagnosticsProvider,
    nativeChatAvailable,
  });

  // ── 4. Status bar ────────────────────────────────────────────────────────────
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'agi-workforce.selectModel';
  statusBar.tooltip = 'AGI Workforce — click to change model';
  context.subscriptions.push(statusBar);

  function updateStatusBar(): void {
    const model = normalizeConfiguredModelId(Config.model());
    statusBar.text = buildExtensionStatusBarText(model, Config.agentMode(), Config.mcpEnabled());
    statusBar.show();
  }

  updateStatusBar();
  void reconcileAgentControlConsent(context)
    .then(updateStatusBar)
    .catch((error: unknown) => {
      recordFailure('agent-mode-consent', error);
    });
  void validateAdvancedFeatureFlags(context);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration('agiWorkforce.agent.mode') ||
        e.affectsConfiguration('agiWorkforce.agent.effort')
      ) {
        void reconcileAgentControlConsent(context)
          .then(updateStatusBar)
          .catch((error: unknown) => {
            recordFailure('agent-mode-consent', error);
          });
      }

      if (e.affectsConfiguration('agiWorkforce.cliPath')) {
        localRuntimes.restartAll();
        conversationTreeProvider.refresh();
      }

      if (
        e.affectsConfiguration('agiWorkforce.model') ||
        e.affectsConfiguration('agiWorkforce.agent.planMode') ||
        e.affectsConfiguration('agiWorkforce.agent.mode') ||
        e.affectsConfiguration('agiWorkforce.agent.effort') ||
        e.affectsConfiguration('agiWorkforce.mcp.enabled') ||
        e.affectsConfiguration('agiWorkforce.desktopBridge.enabled') ||
        e.affectsConfiguration('agiWorkforce.desktopBridge.port')
      ) {
        updateStatusBar();
      }

      if (
        e.affectsConfiguration('agiWorkforce.model') ||
        e.affectsConfiguration('agiWorkforce.apiKey')
      ) {
        sidebarProvider.pushUsageMeter();
      }

      if (e.affectsConfiguration('agiWorkforce.inlineCompletions.enabled')) {
        syncInlineCompletionProvider();
      }

      if (e.affectsConfiguration('agiWorkforce.codeLensEnabled')) {
        syncCodeLensProvider();
      }

      if (
        e.affectsConfiguration('agiWorkforce.inlineCompletions.enabled') ||
        e.affectsConfiguration('agiWorkforce.mcp.enabled') ||
        e.affectsConfiguration('agiWorkforce.desktopBridge.enabled') ||
        e.affectsConfiguration('agiWorkforce.desktopBridge.port')
      ) {
        void validateAdvancedFeatureFlags(context);
      }
    }),
  );

  // ── 5. First-run prompts ─────────────────────────────────────────────────────
  void checkInlineCompletionsFirstRun(context);

  // ── 6. Fetch tier info on activation (fire-and-forget) ──────────────────────
  void refreshAccountTierCache(context).catch(() => {
    // Non-critical — model admission falls back to BYOK when the account tier
    // cannot be persisted (for example, a read-only editor profile).
  });
}

// ─── Deactivation ─────────────────────────────────────────────────────────────

export function deactivate(): void {
  // Nothing to clean up — VS Code handles subscriptions disposal
}

// ─── Sessions history helper ───────────────────────────────────────────────────
// Exported so tests can import it without activating the extension.
export function sessionHistoryRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

// ─── First-run helpers ────────────────────────────────────────────────────────

async function checkInlineCompletionsFirstRun(context: vscode.ExtensionContext): Promise<void> {
  if (!Config.inlineCompletionsEnabled()) return;

  const inspected = vscode.workspace
    .getConfiguration()
    .inspect('agiWorkforce.inlineCompletions.enabled');
  if (inspected?.globalValue !== undefined) return;

  const alreadyShown = context.globalState.get<boolean>('inlineCompletions.firstRunNoticeShown');
  if (alreadyShown === true) return;

  const choice = await vscode.window.showInformationMessage(
    'AGI Workforce inline completions are now active. On each keystroke, up to ' +
      '~100 lines of surrounding code are sent to the AGI Workforce API for ' +
      'suggestion. Files in the sensitive-file denylist (.env, .pem, .ssh/, ' +
      'credentials, secrets.json, etc.) are automatically excluded. Manage in ' +
      'Settings → AGI Workforce.',
    'Got it',
    "Don't show again",
  );

  await context.globalState.update('inlineCompletions.firstRunNoticeShown', true);
  void choice;
}
