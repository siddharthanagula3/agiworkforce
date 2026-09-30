import * as vscode from 'vscode';
import {
  continueCloudWorkHere,
  openDeveloperSessionLink,
  PULL_CLOUD_TASK_COMMAND,
  parseCloudTaskHandoffQuery,
  pullCloudResultIntoCheckout,
  readWorkspaceCloudSource,
  registerContextHandoffUriHandler,
  resolveGitCheckoutHost,
  resumePendingDeveloperSession,
  type ContextHandoffTarget,
} from './features/context-handoff';
import {
  CONTINUE_IN_CLOUD_COMMAND,
  continueInCloud,
  OPEN_CLOUD_CODE_SESSION_COMMAND,
  resolveCloudCodeApi,
  showCloudCodeSession,
} from './features/cloud-tasks';
import { getCloudWebOrigin } from './utils/api';
import { SHOW_HELP_COMMAND, showHelpMenu } from './features/help/helpMenu';
import {
  SHOW_APPROVAL_HISTORY_COMMAND,
  showApprovalHistory,
} from './features/permissions/approvalHistory';
import {
  SHOW_SESSION_ACTIVITY_COMMAND,
  showSessionReceipt,
} from './features/sidebar-webview/sessionReceipt';
import { resolveCloudCodeAgentModel } from '@agiworkforce/types';
import { resolveTierSync } from './integrations/tierResolver';
import { Config } from './platform/config';
import { initModelMetrics } from './features/model-picker/modelMetrics';
import { startVscodeHeartbeat } from './features/device-registry';
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
import { announceExtensionUpdate, announceMissingNativeChat } from './core/hostNotices';
import { markInUse, whenInUse } from './core/startupWork';
import * as telemetry from './core/telemetry';
import { installGlobalErrorReporting } from './core/errorReporting';
import { activateProductAnalytics } from './features/analytics/productAnalytics';
import { LocalRuntimeClient } from './integrations/localRuntimeClient';
import { LocalRuntimePool } from './integrations/localRuntimePool';
import { refreshAccountTierCache, watchAccountTierInvalidation } from './integrations/tierResolver';
import { getExtensionVersion } from './platform/version';
import {
  describeRemoteEnvironment,
  nodeCliResolutionHost,
  resolveCliPath,
} from './platform/remoteEnvironment';
import { ChatEditorPanel } from './providers/chatEditorPanel';
import {
  buildPullRequestReviewPrompt,
  buildSecurityReviewPrompt,
  runEditorUtility,
  setEditorUtilityChat,
} from './features/editor-utilities';
import {
  initializeAgentModeConsent,
  reconcileAgentControlConsent,
} from './features/permissions/agentModeConsent';
import { registerProposedChangeReview } from './features/permissions/proposedChangeReview';
import { registerRemoteControl } from './features/remote-control';

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
    context.subscriptions.push(activateProductAnalytics(context));
  });

  runBoot('error-reporting', () => {
    context.subscriptions.push(installGlobalErrorReporting());
  });

  runBoot('model-metrics', () => {
    initModelMetrics(context);
  });

  whenInUse(() => {
    runBoot('device-registry', () => {
      context.subscriptions.push(startVscodeHeartbeat(context));
    });
  });

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

  const remoteEnvironment = describeRemoteEnvironment(vscode.env.remoteName);
  const localRuntimes = new LocalRuntimePool(
    (cwd) =>
      new LocalRuntimeClient({
        cliPath: () => resolveCliPath(Config.cliPath(), nodeCliResolutionHost()),
        memoryEnabled: () => Config.memoryEnabled(),
        cwd,
        clientVersion: getExtensionVersion(),
        ...(remoteEnvironment.kind === 'local'
          ? {}
          : { environmentLabel: remoteEnvironment.label }),
      }),
  );
  activeLocalRuntimes = localRuntimes;
  context.subscriptions.push(localRuntimes, registerProposedChangeReview());
  runBoot('remote-control', () => {
    context.subscriptions.push(registerRemoteControl(context, localRuntimes));
  });

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

  const resolveChatTarget = (): ContextHandoffTarget | undefined => {
    const provider = chatState?.sidebarProvider;
    if (provider === undefined) return undefined;
    markInUse('session-restore');
    return {
      prefillComposer: (text: string) => provider.prefillComposer(text),
      reveal: async () => {
        try {
          await vscode.commands.executeCommand('agi-workforce.sidebar.focus');
        } finally {
          provider.reveal();
        }
      },
    };
  };
  context.subscriptions.push(
    registerContextHandoffUriHandler(resolveChatTarget, resolveGitCheckoutHost, (link) =>
      openDeveloperSessionLink(link, context.globalState),
    ),
  );

  runBoot('cloud-task-pull', () => {
    context.subscriptions.push(
      vscode.commands.registerCommand(PULL_CLOUD_TASK_COMMAND, async (argument: unknown) => {
        const query = typeof argument === 'string' ? argument : '';
        const handoff = parseCloudTaskHandoffQuery(query);
        if (handoff === null) {
          void vscode.window.showWarningMessage(
            'AGI Workforce: open a cloud task first, this command needs the task it should bring in.',
          );
          return;
        }
        await pullCloudResultIntoCheckout(handoff, await resolveGitCheckoutHost());
      }),
      vscode.commands.registerCommand(
        OPEN_CLOUD_CODE_SESSION_COMMAND,
        async (argument: unknown) => {
          if (typeof argument !== 'string' || argument === '') {
            void vscode.window.showWarningMessage(
              'AGI Workforce: pick an AGI Code session from Sessions, this command needs the session to open.',
            );
            return;
          }
          const code = await resolveCloudCodeApi(context.secrets);
          if (code.status === 'signed-out') {
            void vscode.window.showWarningMessage(
              'AGI Workforce: sign in to AGI Cloud to open AGI Code sessions.',
            );
            return;
          }
          await showCloudCodeSession(code.api, argument, {
            webOrigin: getCloudWebOrigin(),
            bringBranchIn: async (query) => {
              await vscode.commands.executeCommand(PULL_CLOUD_TASK_COMMAND, query);
            },
            continueHere: async (draft, handoff) => {
              const target = resolveChatTarget();
              if (target === undefined) {
                void vscode.window.showWarningMessage(
                  'AGI Workforce: the chat view is not available, so this session was not placed. Reload the window and open it again.',
                );
                return;
              }
              await continueCloudWorkHere(draft, handoff, target, resolveGitCheckoutHost);
            },
          });
        },
      ),
      vscode.commands.registerCommand(SHOW_APPROVAL_HISTORY_COMMAND, () =>
        showApprovalHistory(context.secrets),
      ),
      vscode.commands.registerCommand(SHOW_SESSION_ACTIVITY_COMMAND, async () => {
        const provider = chatState?.sidebarProvider;
        try {
          await showSessionReceipt(await provider?.activeThreadReceipt());
        } catch (error) {
          void vscode.window.showErrorMessage(
            `AGI Workforce: this session's activity could not be read, ${error instanceof Error ? error.message : String(error)}.`,
          );
        }
      }),
      vscode.commands.registerCommand(CONTINUE_IN_CLOUD_COMMAND, () =>
        continueInCloud({
          readSource: readWorkspaceCloudSource,
          resolveApi: async () => {
            const code = await resolveCloudCodeApi(context.secrets);
            return code.status === 'ready' ? code.api : null;
          },
          modelId: () =>
            resolveCloudCodeAgentModel(
              normalizeConfiguredModelId(Config.model()),
              resolveTierSync(context),
            ),
        }),
      ),
    );
  });

  setEditorUtilityChat(
    sidebarProvider === undefined
      ? undefined
      : async (prompt: string) => {
          sidebarProvider.askInChat(prompt);
          try {
            await vscode.commands.executeCommand('agi-workforce.sidebar.focus');
          } finally {
            sidebarProvider.reveal();
          }
        },
  );
  context.subscriptions.push(
    { dispose: () => setEditorUtilityChat(undefined) },
    vscode.commands.registerCommand('agi-workforce.reviewPullRequest', async () => {
      const reference = await vscode.window.showInputBox({
        title: 'AGI Workforce, Review a pull request',
        prompt: 'A pull request number, such as 128, or a branch name',
        ignoreFocusOut: true,
      });
      if (reference === undefined || reference.trim() === '') return;
      await runEditorUtility(buildPullRequestReviewPrompt(reference));
    }),
    vscode.commands.registerCommand(SHOW_HELP_COMMAND, showHelpMenu),
    vscode.commands.registerCommand('agi-workforce.securityReview', () =>
      runEditorUtility(buildSecurityReviewPrompt()),
    ),
  );

  const refreshRuntimeSurfaces = (): void => {
    sidebarProvider?.refreshRuntimeStatus();
    ChatEditorPanel.refreshRuntimeStatus();
    conversationTreeProvider?.refresh();
  };
  context.subscriptions.push(
    vscode.workspace.onDidGrantWorkspaceTrust(refreshRuntimeSurfaces),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void localRuntimes.retainWorkspaces(
        (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath),
      );
      refreshRuntimeSurfaces();
    }),
  );

  if (chatState !== undefined && providerState !== undefined) {
    const chat = chatState;
    const providers = providerState;
    runBoot('chat-panel-restore', () => {
      context.subscriptions.push(
        ChatEditorPanel.registerSerializer(
          context.extensionUri,
          context.secrets,
          context,
          localRuntimes,
          chat.conversationTreeProvider,
          providers.diffDecorationProvider,
          () => markInUse('session-restore'),
        ),
      );
    });
    try {
      setupCommands(context, {
        sidebarProvider: chat.sidebarProvider,
        conversationTreeProvider: chat.conversationTreeProvider,
        cloudTasksTreeProvider: chat.cloudTasksTreeProvider,
        schedulesTreeProvider: chat.schedulesTreeProvider,
        projectsTreeProvider: chat.projectsTreeProvider,
        artifactsTreeProvider: chat.artifactsTreeProvider,
        artifactContentProvider: chat.artifactContentProvider,
        connectorsTreeProvider: chat.connectorsTreeProvider,
        localRuntimes,
        contextPanelProvider: chat.contextPanelProvider,
        memoryTreeProvider: chat.memoryTreeProvider,
        diffDecorationProvider: providers.diffDecorationProvider,
        diagnosticsProvider: providers.diagnosticsProvider,
        nativeChatAvailable: chat.nativeChatAvailable,
      });
      void resumePendingDeveloperSession(context.globalState);
    } catch (err) {
      reportBootFailure('commands', err, 'Some AGI Workforce commands could not be registered');
    }
  }

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'agi-workforce.selectModel';
  statusBar.tooltip = 'AGI Workforce, click to change model';
  context.subscriptions.push(statusBar);

  function updateStatusBar(): void {
    const model = normalizeConfiguredModelId(sidebarProvider?.activeModel() ?? Config.model());
    statusBar.text = buildExtensionStatusBarText(model, Config.agentMode());
    statusBar.show();
  }

  updateStatusBar();
  if (sidebarProvider !== undefined) {
    context.subscriptions.push(sidebarProvider.onDidChangeActiveModel(updateStatusBar));
  }
  void reconcileAgentControlConsent(context)
    .then(updateStatusBar)
    .catch((error: unknown) => {
      recordFailure('agent-mode-consent', error);
    });
  void validateAdvancedFeatureFlags(context);
  void announceExtensionUpdate(context.globalState);
  if (chatState !== undefined && !chatState.nativeChatAvailable) {
    void announceMissingNativeChat(context.globalState);
  }

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

      const runtimeSetting = e.affectsConfiguration('agiWorkforce.cliPath')
        ? 'the CLI path'
        : e.affectsConfiguration('agiWorkforce.memory.enabled')
          ? 'the memory setting'
          : undefined;
      if (runtimeSetting !== undefined) {
        void localRuntimes
          .restartAll()
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(
              `AGI Workforce: Could not restart the local runtime after ${runtimeSetting} changed, ${message}`,
            );
          })
          .finally(refreshRuntimeSurfaces);
      }

      if (
        e.affectsConfiguration('agiWorkforce.model') ||
        e.affectsConfiguration('agiWorkforce.agent.planMode') ||
        e.affectsConfiguration('agiWorkforce.agent.mode') ||
        e.affectsConfiguration('agiWorkforce.agent.effort')
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

      if (
        e.affectsConfiguration('agiWorkforce.editorContext.autoAttach') ||
        e.affectsConfiguration('agiWorkforce.respectGitIgnore') ||
        e.affectsConfiguration('search.useIgnoreFiles') ||
        e.affectsConfiguration('search.exclude') ||
        e.affectsConfiguration('files.exclude')
      ) {
        sidebarProvider?.pushEditorContext();
      }

      if (e.affectsConfiguration('agiWorkforce.composer.followUpBehavior')) {
        sidebarProvider?.pushFollowUpBehavior();
        ChatEditorPanel.pushFollowUpBehavior();
      }

      if (e.affectsConfiguration('agiWorkforce.inlineCompletions.enabled')) {
        void validateAdvancedFeatureFlags(context);
      }
    }),
  );

  void checkInlineCompletionsFirstRun(context);

  watchAccountTierInvalidation(context);
  whenInUse(() => {
    void refreshAccountTierCache(context).catch(() => {});
  });

  if (Config.activateOnStartup()) markInUse('startup-setting');
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
