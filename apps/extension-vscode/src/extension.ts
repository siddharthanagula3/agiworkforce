/**
 * extension.ts — AGI Workforce VS Code Extension entry point
 *
 * Activated on startup (activationEvents: ["onStartupFinished"]).
 * Orchestrates lifecycle setup via the lifecycle/ modules.
 */

import * as vscode from 'vscode';
import { getApiKey } from './utils/api';
import { fetchTierInfo } from './utils/api';
import { Config } from './utils/config';
import { AgentModePanel } from './providers/agentModeProvider';
import { getDesktopBridge } from './services/desktopBridge';
import { activateDesktopBridge } from './services/desktopBridge';
import { initModelMetrics } from './services/modelMetrics';
import { normalizeConfiguredModelId } from './services/modelConstants';
import { initSubsystemHealth, runBoot, recordFailure } from './services/subsystemHealth';
import { initCheckpointManager } from './services/checkpointManager';
import { validateAdvancedFeatureFlags } from './lifecycle/advancedFeatures';
import { setupChat } from './lifecycle/chatSetup';
import { setupProviders } from './lifecycle/providerSetup';
import { setupCommands } from './lifecycle/commandSetup';
import * as telemetry from './services/telemetry';

// ─── Activation ───────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
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

  // ── 0d. Checkpoint manager ───────────────────────────────────────────────────
  runBoot('checkpoint-manager', () => {
    initCheckpointManager(context);
  });

  // ── 0e. MCP enabled → ensure bridge connects on startup ─────────────────────
  if (Config.mcpEnabled()) {
    const bridge = getDesktopBridge();
    if (bridge !== undefined && bridge.status === 'disconnected') {
      void bridge.connect();
    }
  }

  // ── 1. Chat participant + sidebar + conversation tree + context tree ─────────
  const chatState = setupChat(context);
  const { sidebarProvider, conversationStore, conversationTreeProvider, contextPanelProvider } =
    chatState;

  // ── 2. Code intelligence + diff + inline completion providers ────────────────
  const providerState = setupProviders(context);
  const {
    diffDecorationProvider,
    diagnosticsProvider,
    syncCodeLensProvider,
    syncInlineCompletionProvider,
  } = providerState;

  // ── 3. Commands ──────────────────────────────────────────────────────────────
  setupCommands(context, {
    sidebarProvider,
    conversationStore,
    conversationTreeProvider,
    contextPanelProvider,
    diffDecorationProvider,
    diagnosticsProvider,
  });

  // ── 4. Status bar ────────────────────────────────────────────────────────────
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'agi-workforce.selectModel';
  statusBar.tooltip = 'AGI Workforce — click to change model';
  context.subscriptions.push(statusBar);

  function updateStatusBar(): void {
    const model = normalizeConfiguredModelId(Config.model());
    const chips: string[] = [];

    const mode = Config.agentMode();
    if (mode !== 'auto') chips.push(mode);
    if (Config.mcpEnabled()) chips.push('mcp');
    if (Config.desktopBridgeEnabled()) chips.push(`bridge:${Config.desktopBridgePort()}`);

    statusBar.text =
      chips.length > 0 ? `$(hubot) AGI: ${model} · ${chips.join(' · ')}` : `$(hubot) AGI: ${model}`;
    statusBar.show();
  }

  updateStatusBar();
  void validateAdvancedFeatureFlags(context);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
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

      if (
        e.affectsConfiguration('agiWorkforce.agent.planMode') ||
        e.affectsConfiguration('agiWorkforce.agent.mode')
      ) {
        AgentModePanel.currentPanel?.setPlanMode(Config.agentMode() === 'plan');
      }

      if (e.affectsConfiguration('agiWorkforce.mcp.enabled')) {
        const mcpEnabled = Config.mcpEnabled();
        const bridge = getDesktopBridge();
        if (bridge !== undefined) {
          if (mcpEnabled && bridge.status === 'disconnected') {
            void bridge.connect();
          } else if (!mcpEnabled && bridge.status === 'connected') {
            bridge.disconnect();
          }
        }
      }
    }),
  );

  // ── 5. First-run prompts ─────────────────────────────────────────────────────
  void checkFirstRun(context);
  void checkInlineCompletionsFirstRun(context);

  // ── 6. Fetch tier info on activation (fire-and-forget) ──────────────────────
  void fetchTierInfo(context.secrets).then(async (tierInfo) => {
    if (tierInfo === undefined) return;
    try {
      await context.globalState.update('tierStatus.cachedTier', tierInfo.tier);
      await vscode.workspace
        .getConfiguration('agiWorkforce')
        .update('currentTier', tierInfo.tier, vscode.ConfigurationTarget.Global);
    } catch {
      // Non-critical — silently ignore update failures (e.g. no workspace)
    }
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
  const inspected = vscode.workspace
    .getConfiguration()
    .inspect('agiWorkforce.inlineCompletions.enabled');
  if (inspected?.globalValue !== undefined) return;

  const alreadyShown = context.globalState.get<boolean>('inlineCompletions.firstRunNoticeShown');
  if (alreadyShown === true) return;

  const choice = await vscode.window.showInformationMessage(
    'AGI Workforce inline completions are now active. They suggest code as you type. Manage in Settings → AGI Workforce.',
    'Got it',
    "Don't show again",
  );

  await context.globalState.update('inlineCompletions.firstRunNoticeShown', true);
  void choice;
}

async function checkFirstRun(context: vscode.ExtensionContext): Promise<void> {
  const hasShownWelcome = context.globalState.get<boolean>('agiWorkforce.shownWelcome');
  if (hasShownWelcome === true) return;

  const hasKey = (await getApiKey(context.secrets)) !== undefined;
  if (hasKey) {
    await context.globalState.update('agiWorkforce.shownWelcome', true);
    return;
  }

  const choice = await vscode.window.showInformationMessage(
    'Welcome to AGI Workforce! Set up your API key to use Claude, GPT, Gemini, and 10+ providers in VS Code.',
    'Set API Key',
    'Later',
  );

  await context.globalState.update('agiWorkforce.shownWelcome', true);

  if (choice === 'Set API Key') {
    await vscode.commands.executeCommand('agi-workforce.setApiKey');
  }
}
