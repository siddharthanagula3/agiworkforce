import * as vscode from 'vscode';
import { Config } from './platform/config';
import { activateDesktopBridge } from './features/desktop-bridge';
import { initModelMetrics } from './features/model-picker/modelMetrics';
import { normalizeConfiguredModelId } from './features/model-picker/modelConstants';
import { initSubsystemHealth, runBoot, recordFailure } from './core/subsystemHealth';
import { validateAdvancedFeatureFlags } from './core/advancedFeatures';
import { buildExtensionStatusBarText } from './core/statusBar';
import { setupChat, type ChatState } from './core/chatSetup';
import {
  setupProviders,
  createDegradedProviderState,
  type ProviderState,
} from './core/providerSetup';
import { setupCommands } from './core/commandSetup';
import * as telemetry from './core/telemetry';
import { installGlobalErrorReporting } from './core/errorReporting';
import { LocalRuntimeClient } from './integrations/localRuntimeClient';
import { LocalRuntimePool } from './integrations/localRuntimePool';
import { refreshAccountTierCache } from './integrations/tierResolver';
import { getExtensionVersion } from './platform/version';
import { ChatEditorPanel } from './providers/chatEditorPanel';
import {
  initializeAgentModeConsent,
  reconcileAgentControlConsent,
} from './features/permissions/agentModeConsent';

let activeLocalRuntimes: LocalRuntimePool | undefined;

function reportBootFailure(subsystem: string, err: unknown, impact: string): void {
  recordFailure(subsystem, err);
  const message = err instanceof Error ? err.message : String(err);
  void vscode.window.showErrorMessage(`AGI Workforce: ${impact}, ${message}`);
}

export function activate(context: vscode.ExtensionContext): void {
  initializeAgentModeConsent(context);

  initSubsystemHealth(context);

  runBoot('telemetry', () => {
    context.subscriptions.push(telemetry.activate(context));
  });

  runBoot('error-reporting', () => {
    context.subscriptions.push(installGlobalErrorReporting());
  });

  runBoot('model-metrics', () => {
    initModelMetrics(context);
  });

  try {
    context.subscriptions.push(activateDesktopBridge(context));
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    recordFailure('desktop-bridge', err);
    vscode.window.showWarningMessage(
      `AGI Workforce: Desktop bridge failed to initialize, ${errMsg}. ` +
        'Some features may be unavailable.',
    );
  }

  let providerState: ProviderState | undefined;
  try {
    providerState = setupProviders(context);
  } catch (err) {
    reportBootFailure(
      'providers',
      err,
      'Code intelligence (hover, CodeLens, inline completions, diagnostics) is unavailable',
    );
    try {
      providerState = createDegradedProviderState(context);
    } catch (fallbackErr) {
      recordFailure('providers-degraded', fallbackErr);
    }
  }
  const diffDecorationProvider = providerState?.diffDecorationProvider;
  const syncCodeLensProvider = providerState?.syncCodeLensProvider;
  const syncInlineCompletionProvider = providerState?.syncInlineCompletionProvider;

  const localRuntimes = new LocalRuntimePool(
    (cwd) =>
      new LocalRuntimeClient({
        cliPath: () => Config.cliPath(),
        cwd,
        clientVersion: getExtensionVersion(),
      }),
  );
  activeLocalRuntimes = localRuntimes;
  context.subscriptions.push(localRuntimes);

  let chatState: ChatState | undefined;
  try {
    chatState = setupChat(context, localRuntimes, diffDecorationProvider);
  } catch (err) {
    reportBootFailure(
      'chat',
      err,
      'The AGI chat view failed to register and the panel will stay empty. Reload the window to retry',
    );
  }
  const sidebarProvider = chatState?.sidebarProvider;
  const conversationTreeProvider = chatState?.conversationTreeProvider;

  const refreshRuntimeSurfaces = (): void => {
    sidebarProvider?.refreshRuntimeStatus();
    ChatEditorPanel.refreshRuntimeStatus();
    conversationTreeProvider?.refresh();
  };
  context.subscriptions.push(
    vscode.workspace.onDidGrantWorkspaceTrust(refreshRuntimeSurfaces),
    vscode.workspace.onDidChangeWorkspaceFolders(refreshRuntimeSurfaces),
  );

  if (chatState !== undefined && providerState !== undefined) {
    try {
      setupCommands(context, {
        sidebarProvider: chatState.sidebarProvider,
        conversationTreeProvider: chatState.conversationTreeProvider,
        localRuntimes,
        contextPanelProvider: chatState.contextPanelProvider,
        memoryTreeProvider: chatState.memoryTreeProvider,
        diffDecorationProvider: providerState.diffDecorationProvider,
        diagnosticsProvider: providerState.diagnosticsProvider,
        nativeChatAvailable: chatState.nativeChatAvailable,
      });
    } catch (err) {
      reportBootFailure('commands', err, 'Some AGI Workforce commands could not be registered');
    }
  }

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'agi-workforce.selectModel';
  statusBar.tooltip = 'AGI Workforce, click to change model';
  context.subscriptions.push(statusBar);

  function updateStatusBar(): void {
    const model = normalizeConfiguredModelId(Config.model());
    statusBar.text = buildExtensionStatusBarText(model, Config.agentMode());
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
        void localRuntimes
          .restartAll()
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(
              `AGI Workforce: Could not restart the local runtime after the CLI path changed, ${message}`,
            );
          })
          .finally(refreshRuntimeSurfaces);
      }

      if (
        e.affectsConfiguration('agiWorkforce.model') ||
        e.affectsConfiguration('agiWorkforce.agent.planMode') ||
        e.affectsConfiguration('agiWorkforce.agent.mode') ||
        e.affectsConfiguration('agiWorkforce.agent.effort') ||
        e.affectsConfiguration('agiWorkforce.desktopBridge.enabled') ||
        e.affectsConfiguration('agiWorkforce.desktopBridge.port')
      ) {
        updateStatusBar();
      }

      if (
        e.affectsConfiguration('agiWorkforce.model') ||
        e.affectsConfiguration('agiWorkforce.apiKey')
      ) {
        if (e.affectsConfiguration('agiWorkforce.model')) {
          sidebarProvider?.syncModelFromConfiguration();
        }
        sidebarProvider?.pushUsageMeter();
      }

      if (e.affectsConfiguration('agiWorkforce.inlineCompletions.enabled')) {
        syncInlineCompletionProvider?.();
      }

      if (e.affectsConfiguration('agiWorkforce.codeLensEnabled')) {
        syncCodeLensProvider?.();
      }

      if (e.affectsConfiguration('agiWorkforce.composer.followUpBehavior')) {
        sidebarProvider?.pushFollowUpBehavior();
        ChatEditorPanel.pushFollowUpBehavior();
      }

      if (
        e.affectsConfiguration('agiWorkforce.inlineCompletions.enabled') ||
        e.affectsConfiguration('agiWorkforce.desktopBridge.enabled') ||
        e.affectsConfiguration('agiWorkforce.desktopBridge.port')
      ) {
        void validateAdvancedFeatureFlags(context);
      }
    }),
  );

  void checkInlineCompletionsFirstRun(context);

  void refreshAccountTierCache(context).catch(() => {});
}

export async function deactivate(): Promise<void> {
  const localRuntimes = activeLocalRuntimes;
  activeLocalRuntimes = undefined;
  await localRuntimes?.shutdownAll();
}

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
