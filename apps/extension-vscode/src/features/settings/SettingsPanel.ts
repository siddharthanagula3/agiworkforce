import * as vscode from 'vscode';
import { Config, type MutableConfigKey } from '../../platform/config';
import { fetchAccountIdentity, fetchTierInfo, getAccountAuthState } from '../../utils/api';
import { clearAccountTierCache, refreshAccountTierCache } from '../../integrations/tierResolver';
import { getNonce } from '../sidebar-webview/webviewContent';
import {
  isSettingsSection,
  parseSettingsWebviewMessage,
  type SettingsCommand,
  type SettingsHostMessage,
  type SettingsPanelState,
  type SettingsSection,
} from './settingsProtocol';
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

const EXTERNAL_DESTINATIONS: Partial<Record<SettingsCommand, string>> = {
  manageUsage: 'https://agiworkforce.com/settings/usage?from=vscode-extension',
  manageBilling: 'https://agiworkforce.com/settings/billing?from=vscode-extension',
  viewPlans: 'https://agiworkforce.com/pricing?from=vscode-extension',
  manageConnectors: 'https://agiworkforce.com/connectors?from=vscode-extension',
  manageTeam: 'https://agiworkforce.com/teams?from=vscode-extension',
  openDocs: 'https://agiworkforce.com/docs?from=vscode-extension',
  openConfigDocs: 'https://agiworkforce.com/docs?topic=configuration&from=vscode-extension',
  openInstructionDocs:
    'https://agiworkforce.com/docs?topic=custom-instructions&from=vscode-extension',
};

export class SettingsPanel {
  public static readonly viewType = 'agi-workforce.settingsPanel';
  private static instance: SettingsPanel | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private refreshSequence = 0;

  static __resetForTests(): void {
    SettingsPanel.instance = undefined;
  }

  static createOrShow(
    context: vscode.ExtensionContext,
    requestedSection: unknown = 'general',
  ): SettingsPanel {
    const section = isSettingsSection(requestedSection) ? requestedSection : 'general';
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (SettingsPanel.instance !== undefined) {
      SettingsPanel.instance.panel.reveal(column);
      void SettingsPanel.instance.post({ type: 'settings.navigate', section });
      void SettingsPanel.instance.refresh();
      return SettingsPanel.instance;
    }

    const panel = vscode.window.createWebviewPanel(SettingsPanel.viewType, 'AGI Settings', column, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [],
    });
    SettingsPanel.instance = new SettingsPanel(panel, context, section);
    return SettingsPanel.instance;
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    initialSection: SettingsSection,
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
    );

    this.disposables.push(
      this.panel.webview.onDidReceiveMessage(async (input: unknown) => {
        const message = parseSettingsWebviewMessage(input);
        if (message === undefined) {
          console.warn('[AGI Workforce] dropped malformed settings webview message');
          return;
        }

        if (message.type === 'settings.ready') {
          await this.refresh();
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
    const [accountIdentity, tierInfo] = !accountConnected
      ? [undefined, undefined]
      : await Promise.all([
          fetchAccountIdentity(this.context.secrets),
          fetchTierInfo(this.context.secrets),
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
      ...(currentlyConnected && tierInfo !== undefined ? { tierInfo } : {}),
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
      } else {
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
      const destination = EXTERNAL_DESTINATIONS[command];
      if (destination !== undefined) {
        await vscode.env.openExternal(vscode.Uri.parse(destination));
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
