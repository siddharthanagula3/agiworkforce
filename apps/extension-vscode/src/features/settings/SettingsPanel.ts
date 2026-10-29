import { PRODUCT_NAMES } from '@agiworkforce/types';
import * as vscode from 'vscode';
import { Config, type MutableConfigKey } from '../../platform/config';
import {
  fetchAccountIdentity,
  fetchTierInfo,
  fetchUsageHistory,
  getAccountAuthState,
  getCloudWebOrigin,
  type TierInfo,
  type UsageHistoryResult,
} from '../../utils/api';
import { clearAccountTierCache, refreshAccountTierCache } from '../../integrations/tierResolver';
import { getNonce } from '../sidebar-webview/webviewContent';
import {
  isSettingsSection,
  parseSettingsWebviewMessage,
  type SettingsCommand,
  type SettingsLocalCapabilities,
  type SettingsLocalCapabilityKind,
  type SettingsHostMessage,
  type SettingsPanelState,
  type SettingsPlanUsage,
  type SettingsSection,
  type SettingsUsageHistory,
} from './settingsProtocol';
import {
  CREDIT_BALANCE_LABEL,
  CREDIT_TOP_UP_LABEL,
  formatCreditBalance,
  formatCreditSpendability,
} from '../../data/usageMeter';
import { creditWindowRows, summarizeUsageHistory } from '../../data/usagePresentation';
import { planDisplayLabel } from '../account-auth/planLabel';
import { getSettingsWebviewContent } from './settingsWebviewContent';
import { agentConfigPath } from '../config/agentConfig';
import {
  buildInstructionContextSnapshot,
  formatCustomInstructionPrelude,
  getStoredCustomInstructions,
  saveCustomInstructions,
  type CustomInstructionScope,
} from '../instructions';
import { getContextPanelProvider } from '../trees/contextPanelProvider';
import type { CliCapabilityAdapter, CliCapabilityResult } from '../surfaces/cliCapabilities';
import type { McpServerDetailsProvider } from '../surfaces/mcpServerDetails';
import {
  addMcpServerFromSettings,
  loadSettingsCapabilities,
  setSettingsCapabilityEnabled,
  showMcpServerDetailsFromSettings,
} from '../surfaces/capabilityManagement';

export interface SettingsLocalCapabilityHost {
  adapter: CliCapabilityAdapter;
  mcpServerDetails: McpServerDetailsProvider;
}

const LOCAL_RUNTIME_NOT_CONNECTED = 'The AGI CLI is not connected to this window.';

const DISCONNECTED_LOCAL_CAPABILITIES: SettingsLocalCapabilities = {
  mcp: { status: 'unavailable', message: LOCAL_RUNTIME_NOT_CONNECTED },
  plugins: { status: 'unavailable', message: LOCAL_RUNTIME_NOT_CONNECTED },
  skills: { status: 'unavailable', message: LOCAL_RUNTIME_NOT_CONNECTED },
  canAddMcpServer: false,
};

const CAPABILITY_COMMANDS: Partial<Record<SettingsCommand, string>> = {
  showPlugins: 'agi-workforce.showPlugins',
  showSkills: 'agi-workforce.showSkills',
};

const EXTERNAL_DESTINATION_PATHS: Partial<Record<SettingsCommand, string>> = {
  manageAccount: '/settings/account?from=vscode-extension',
  manageUsage: '/settings/usage?from=vscode-extension',
  manageBilling: '/settings/billing?from=vscode-extension',
  viewPlans: '/pricing?from=vscode-extension',
  manageConnectors: '/connectors?from=vscode-extension',
  manageTeam: '/teams?from=vscode-extension',
  openDocs: '/docs?from=vscode-extension',
  openConfigDocs: '/docs?topic=configuration&from=vscode-extension',
  openInstructionDocs: '/docs?topic=custom-instructions&from=vscode-extension',
  openPrivacySettings: '/settings/privacy?from=vscode-extension',
  openSubprocessors: '/subprocessors?from=vscode-extension',
};

function buildPlanUsage(tierInfo: TierInfo, accountPlanName?: string): SettingsPlanUsage {
  const planTier = tierInfo.accountPlanTier ?? tierInfo.tier;
  return {
    planLabel: accountPlanName ?? planDisplayLabel(planTier) ?? planTier,
    windows: tierInfo.credits === undefined ? [] : creditWindowRows(tierInfo.credits),
    credits:
      tierInfo.creditBalanceCents === undefined
        ? null
        : {
            label: CREDIT_BALANCE_LABEL,
            balance: formatCreditBalance(tierInfo.creditBalanceCents),
            spendability: formatCreditSpendability(
              tierInfo.creditBalanceCents,
              tierInfo.overageEnabled === true,
            ),
            topUpLabel: CREDIT_TOP_UP_LABEL,
          },
  };
}

function toSettingsUsageHistory(result: UsageHistoryResult): SettingsUsageHistory {
  return result.kind === 'ready'
    ? { status: 'ready', summary: summarizeUsageHistory(result.history) }
    : { status: 'unavailable', message: result.reason };
}

export class SettingsPanel {
  public static readonly viewType = 'agi-workforce.settingsPanel';
  private static instance: SettingsPanel | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private refreshSequence = 0;
  private capabilitySequence = 0;

  static __resetForTests(): void {
    SettingsPanel.instance = undefined;
  }

  static createOrShow(
    context: vscode.ExtensionContext,
    requestedSection: unknown = 'general',
    signedInThroughCli: () => Promise<boolean> = () => Promise.resolve(false),
    localCapabilities?: SettingsLocalCapabilityHost,
  ): SettingsPanel {
    const section = isSettingsSection(requestedSection) ? requestedSection : 'general';
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (SettingsPanel.instance !== undefined) {
      SettingsPanel.instance.panel.reveal(column);
      void SettingsPanel.instance.post({ type: 'settings.navigate', section });
      void SettingsPanel.instance.refresh();
      void SettingsPanel.instance.refreshCapabilities();
      return SettingsPanel.instance;
    }

    const panel = vscode.window.createWebviewPanel(SettingsPanel.viewType, 'AGI Settings', column, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
    });
    SettingsPanel.instance = new SettingsPanel(
      panel,
      context,
      section,
      signedInThroughCli,
      localCapabilities,
    );
    return SettingsPanel.instance;
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    initialSection: SettingsSection,
    private readonly signedInThroughCli: () => Promise<boolean>,
    private readonly localCapabilities: SettingsLocalCapabilityHost | undefined,
  ) {
    const storedInstructions = getStoredCustomInstructions(this.context);
    const initialState: SettingsPanelState = {
      ...Config.settingsSnapshot(),
      accountConnected: null,
      accountStatus: 'loading',
      agentConfigPath: agentConfigPath(),
      instructionContext: {
        ...storedInstructions,
        turnPrelude: formatCustomInstructionPrelude(storedInstructions),
        projectSources: [],
      },
    };
    this.panel.webview.html = getSettingsWebviewContent(
      this.panel.webview,
      getNonce(),
      initialState,
      initialSection,
      this.context.extensionMode !== vscode.ExtensionMode.Production,
      this.context.extensionUri,
    );

    this.disposables.push(
      this.panel.webview.onDidReceiveMessage(async (input: unknown) => {
        const message = parseSettingsWebviewMessage(input);
        if (message === undefined) {
          console.warn(`[${PRODUCT_NAMES.code}] dropped malformed settings webview message`);
          return;
        }

        if (message.type === 'settings.ready') {
          await Promise.all([this.refresh(), this.refreshCapabilities()]);
          return;
        }

        if (message.type === 'settings.capability.setEnabled') {
          await this.setCapabilityEnabled(message.kind, message.id, message.enabled);
          return;
        }

        if (message.type === 'settings.mcp.add') {
          await this.runCapabilityAction((host) => addMcpServerFromSettings(host.adapter));
          return;
        }

        if (message.type === 'settings.mcp.details') {
          await this.runCapabilityAction((host) =>
            showMcpServerDetailsFromSettings(host.adapter, host.mcpServerDetails, message.name),
          );
          return;
        }

        if (message.type === 'settings.update') {
          await this.updateSetting(message.update.key, message.update);
          return;
        }

        if (message.type === 'settings.instructions.update') {
          await this.updateInstructions(message.scope, message.value);
          return;
        }

        await this.runCommand(message.command);
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('agiWorkforce')) void this.refresh();
      }),
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  private async buildState(): Promise<SettingsPanelState> {
    const accountAuth = await getAccountAuthState(this.context.secrets);
    const accountConnected = accountAuth.status === 'signed-in';
    const [accountIdentity, tierInfo, usageHistory] = !accountConnected
      ? [undefined, undefined, undefined]
      : await Promise.all([
          fetchAccountIdentity(this.context.secrets),
          fetchTierInfo(this.context.secrets),
          fetchUsageHistory(this.context.secrets),
        ]);
    const currentAccountAuth = accountConnected
      ? await getAccountAuthState(this.context.secrets)
      : accountAuth;
    const currentlyConnected = currentAccountAuth.status === 'signed-in';
    return {
      ...Config.settingsSnapshot(),
      accountConnected: currentlyConnected,
      accountStatus: currentAccountAuth.status,
      ...(currentlyConnected && accountIdentity !== undefined ? { accountIdentity } : {}),
      ...(currentlyConnected && tierInfo !== undefined
        ? { tierInfo, planUsage: buildPlanUsage(tierInfo, accountIdentity?.planName) }
        : {}),
      ...(currentlyConnected && usageHistory !== undefined
        ? { usageHistory: toSettingsUsageHistory(usageHistory) }
        : {}),
      agentConfigPath: agentConfigPath(),
      instructionContext: await buildInstructionContextSnapshot(this.context),
    };
  }

  private async refresh(): Promise<void> {
    const sequence = ++this.refreshSequence;
    try {
      const fetchedState = await this.buildState();
      if (sequence !== this.refreshSequence) return;

      if (fetchedState.accountConnected) {
        await refreshAccountTierCache(this.context, async () => fetchedState.tierInfo);
      } else if (!(await this.signedInThroughCli())) {
        await clearAccountTierCache(this.context);
      }
      if (sequence !== this.refreshSequence) return;
      await this.post({
        type: 'settings.snapshot',
        state: { ...fetchedState, ...Config.settingsSnapshot() },
      });
    } catch (error) {
      if (sequence !== this.refreshSequence) return;
      await this.post({
        type: 'settings.error',
        message:
          error instanceof Error
            ? `Could not refresh AGI settings: ${error.message}`
            : 'Could not refresh AGI settings.',
      });
    }
  }

  private async refreshCapabilities(): Promise<void> {
    const sequence = ++this.capabilitySequence;
    const capabilities =
      this.localCapabilities === undefined
        ? DISCONNECTED_LOCAL_CAPABILITIES
        : await loadSettingsCapabilities(this.localCapabilities.adapter);
    if (sequence !== this.capabilitySequence) return;
    await this.post({ type: 'settings.capabilities', capabilities });
  }

  private async setCapabilityEnabled(
    kind: SettingsLocalCapabilityKind,
    id: string,
    enabled: boolean,
  ): Promise<void> {
    await this.runCapabilityAction((host) =>
      setSettingsCapabilityEnabled(host.adapter, kind, id, enabled),
    );
  }

  private async runCapabilityAction(
    action: (
      host: SettingsLocalCapabilityHost,
    ) => Promise<CliCapabilityResult<unknown> | undefined>,
  ): Promise<void> {
    try {
      const outcome =
        this.localCapabilities === undefined
          ? ({ status: 'unavailable', reason: LOCAL_RUNTIME_NOT_CONNECTED } as const)
          : await action(this.localCapabilities);
      if (outcome !== undefined && outcome.status !== 'ok') {
        await this.post({ type: 'settings.error', message: outcome.reason });
      }
    } catch (error) {
      await this.post({
        type: 'settings.error',
        message:
          error instanceof Error
            ? `The requested settings action failed: ${error.message}`
            : 'The requested settings action failed.',
      });
    }
    await this.refreshCapabilities();
  }

  private async updateSetting(
    key: MutableConfigKey,
    update: Parameters<typeof Config.update>[1],
  ): Promise<void> {
    try {
      const saved = await Config.update(this.context, update);
      if (!saved) {
        await this.refresh();
        await this.post({
          type: 'settings.error',
          message:
            'The elevated control combination was not enabled. Your previous settings are unchanged.',
        });
        return;
      }
      await this.post({ type: 'settings.saved', key });
      await this.refresh();
    } catch (error) {
      await this.refresh();
      await this.post({
        type: 'settings.error',
        message:
          error instanceof Error
            ? `Could not save this setting: ${error.message}`
            : 'Could not save this setting.',
      });
    }
  }

  private async updateInstructions(scope: CustomInstructionScope, value: string): Promise<void> {
    try {
      await saveCustomInstructions(this.context, scope, value);
      await getContextPanelProvider()?.refreshInstructionContext();
      await this.post({ type: 'settings.instructions.saved', scope });
      await this.refresh();
    } catch (error) {
      await this.refresh();
      await this.post({
        type: 'settings.error',
        message:
          error instanceof Error
            ? `Could not save custom instructions: ${error.message}`
            : 'Could not save custom instructions.',
      });
    }
  }

  private async runCommand(command: SettingsCommand): Promise<void> {
    try {
      const destinationPath = EXTERNAL_DESTINATION_PATHS[command];
      if (destinationPath !== undefined) {
        await vscode.env.openExternal(vscode.Uri.parse(`${getCloudWebOrigin()}${destinationPath}`));
        return;
      }
      const capabilityCommand = CAPABILITY_COMMANDS[command];
      if (capabilityCommand !== undefined) {
        await vscode.commands.executeCommand(capabilityCommand);
        await this.refreshCapabilities();
        return;
      }

      switch (command) {
        case 'openRawSettings':
          await vscode.commands.executeCommand('workbench.action.openSettings', 'agiWorkforce');
          break;
        case 'selectModel':
          await vscode.commands.executeCommand('agi-workforce.selectModel');
          await this.refresh();
          break;
        case 'showAccountUsage':
          await vscode.commands.executeCommand('agi-workforce.showAccountUsage');
          break;
        case 'signIn':
          await vscode.commands.executeCommand('agi-workforce.signIn');
          await this.refresh();
          break;
        case 'signOut':
          await vscode.commands.executeCommand('agi-workforce.signOut');
          await this.refresh();
          break;
        case 'openMemory':
          await vscode.commands.executeCommand('agi-workforce.memory');
          break;
        case 'openAgentConfig':
          await vscode.commands.executeCommand('agi-workforce.openAgentConfig');
          break;
        case 'restartLocalRuntime':
          await vscode.commands.executeCommand('agi-workforce.restartLocalRuntime');
          break;
      }
    } catch (error) {
      await this.post({
        type: 'settings.error',
        message:
          error instanceof Error
            ? `The requested settings action failed: ${error.message}`
            : 'The requested settings action failed.',
      });
    }
  }

  private async post(message: SettingsHostMessage): Promise<void> {
    await this.panel.webview.postMessage(message);
  }

  private dispose(): void {
    SettingsPanel.instance = undefined;
    for (const disposable of this.disposables) disposable.dispose();
    this.disposables.length = 0;
  }
}
