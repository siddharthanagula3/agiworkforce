import * as vscode from 'vscode';

export type ExtensionAgentMode = 'ask' | 'auto' | 'plan' | 'bypass';

const BYPASS_CONSENT_KEY = 'agiWorkforce.agentMode.bypassConsentVersion';
const BYPASS_CONSENT_VERSION = 1;

export const BYPASS_CONFIRM_ACTION = 'Turn On Bypass Permissions';
export const BYPASS_CANCEL_ACTION = 'Cancel';

let bypassConsentActive = false;
let trustedConfigurationWrites = 0;

function configuredAgentMode(): ExtensionAgentMode {
  const value = vscode.workspace.getConfiguration('agiWorkforce').get<string>('agent.mode', 'auto');
  return value === 'ask' || value === 'auto' || value === 'plan' || value === 'bypass'
    ? value
    : 'auto';
}

async function persistBypassConsent(
  context: vscode.ExtensionContext,
  active: boolean,
): Promise<void> {
  bypassConsentActive = active;
  await context.globalState.update(BYPASS_CONSENT_KEY, active ? BYPASS_CONSENT_VERSION : undefined);
}

async function writeAgentMode(mode: ExtensionAgentMode): Promise<void> {
  trustedConfigurationWrites += 1;
  try {
    await vscode.workspace
      .getConfiguration('agiWorkforce')
      .update('agent.mode', mode, vscode.ConfigurationTarget.Global);
  } finally {
    trustedConfigurationWrites -= 1;
  }
}

async function confirmBypassPermissions(): Promise<boolean> {
  const cancel: vscode.MessageItem = {
    title: BYPASS_CANCEL_ACTION,
    isCloseAffordance: true,
  };
  const confirm: vscode.MessageItem = { title: BYPASS_CONFIRM_ACTION };
  const choice = await vscode.window.showWarningMessage(
    'Turn on Bypass Permissions?',
    {
      modal: true,
      detail:
        "Bypass Permissions removes approval prompts from every enabled agent tool. That includes tools that read or modify the current workspace and any additional directories you already granted, terminal commands that can install software or change system settings using the app's OS-level access, network-capable commands, and configured MCP tools. It does not expand existing OS or workspace grants, but it significantly increases the risk of data loss, sensitive-data exposure, and prompt-injection attacks. You can turn it off from the mode picker or Settings.",
    },
    cancel,
    confirm,
  );
  return choice?.title === BYPASS_CONFIRM_ACTION;
}

/**
 * Load the durable consent marker before any agent-mode setting is consumed.
 * The marker is cleared whenever the user leaves bypass mode, so each future
 * escalation requires a fresh confirmation.
 */
export function initializeAgentModeConsent(context: vscode.ExtensionContext): void {
  const storedConsent =
    context.globalState.get<number>(BYPASS_CONSENT_KEY) === BYPASS_CONSENT_VERSION;
  bypassConsentActive = storedConsent && configuredAgentMode() === 'bypass';
  if (storedConsent && !bypassConsentActive) {
    void context.globalState.update(BYPASS_CONSENT_KEY, undefined);
  }
  trustedConfigurationWrites = 0;
}

/** Fail closed when an unconfirmed raw setting claims bypass mode. */
export function enforceAgentModeConsent(mode: ExtensionAgentMode): ExtensionAgentMode {
  return mode === 'bypass' && !bypassConsentActive ? 'auto' : mode;
}

/**
 * The only supported mutation boundary for in-product agent-mode controls.
 * Returns false when the user cancels the bypass escalation.
 */
export async function setAgentModeWithConsent(
  context: vscode.ExtensionContext,
  mode: ExtensionAgentMode,
): Promise<boolean> {
  const current = configuredAgentMode();
  if (mode === 'bypass' && (current !== 'bypass' || !bypassConsentActive)) {
    if (!(await confirmBypassPermissions())) return false;
    await persistBypassConsent(context, true);
  } else if (mode !== 'bypass') {
    await persistBypassConsent(context, false);
  }

  await writeAgentMode(mode);
  return true;
}

/**
 * Reconcile edits made through VS Code's raw Settings UI or settings JSON.
 * Unconfirmed bypass is made ineffective by `enforceAgentModeConsent`, reset
 * to Auto, and only restored after the same modal confirmation used elsewhere.
 */
export async function reconcileAgentModeConsent(context: vscode.ExtensionContext): Promise<void> {
  const configured = configuredAgentMode();
  if (configured !== 'bypass') {
    if (bypassConsentActive) await persistBypassConsent(context, false);
    return;
  }
  if (bypassConsentActive || trustedConfigurationWrites > 0) return;

  await writeAgentMode('auto');
  if (await confirmBypassPermissions()) {
    await persistBypassConsent(context, true);
    await writeAgentMode('bypass');
    return;
  }

  vscode.window.showInformationMessage(
    'AGI Workforce kept Auto mode. Bypass Permissions was not enabled.',
  );
}
