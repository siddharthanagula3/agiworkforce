import * as vscode from 'vscode';

export type ExtensionAgentMode = 'ask' | 'auto' | 'plan' | 'bypass';
export type ExtensionAgentEffort = 'low' | 'medium' | 'high' | 'max';

const BYPASS_CONSENT_KEY = 'agiWorkforce.agentMode.bypassConsentVersion';
const BYPASS_CONSENT_VERSION = 1;
const MAX_BYPASS_CONSENT_KEY = 'agiWorkforce.agentMode.maxBypassConsentVersion';
const MAX_BYPASS_CONSENT_VERSION = 1;

export const BYPASS_CONFIRM_ACTION = 'Turn On Bypass Permissions';
export const BYPASS_CANCEL_ACTION = 'Cancel';
export const MAX_BYPASS_CONFIRM_ACTION = 'Use Max with Bypass Permissions';
export const MAX_BYPASS_CANCEL_ACTION = 'Keep Safer Settings';

let bypassConsentActive = false;
let maxBypassConsentActive = false;
let trustedConfigurationWrites = 0;
let trustedEffortWrites = 0;
let reconciliationQueue = Promise.resolve();

function configuredAgentMode(): ExtensionAgentMode {
  const value = vscode.workspace.getConfiguration('agiWorkforce').get<string>('agent.mode', 'auto');
  return value === 'ask' || value === 'auto' || value === 'plan' || value === 'bypass'
    ? value
    : 'auto';
}

function configuredAgentEffort(): ExtensionAgentEffort {
  const value = vscode.workspace
    .getConfiguration('agiWorkforce')
    .get<string>('agent.effort', 'medium');
  return value === 'low' || value === 'medium' || value === 'high' || value === 'max'
    ? value
    : 'medium';
}

async function persistBypassConsent(
  context: vscode.ExtensionContext,
  active: boolean,
): Promise<void> {
  bypassConsentActive = active;
  await context.globalState.update(BYPASS_CONSENT_KEY, active ? BYPASS_CONSENT_VERSION : undefined);
}

async function persistMaxBypassConsent(
  context: vscode.ExtensionContext,
  active: boolean,
): Promise<void> {
  maxBypassConsentActive = active;
  await context.globalState.update(
    MAX_BYPASS_CONSENT_KEY,
    active ? MAX_BYPASS_CONSENT_VERSION : undefined,
  );
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

async function writeAgentEffort(effort: ExtensionAgentEffort): Promise<void> {
  trustedEffortWrites += 1;
  try {
    await vscode.workspace
      .getConfiguration('agiWorkforce')
      .update('agent.effort', effort, vscode.ConfigurationTarget.Global);
  } finally {
    trustedEffortWrites -= 1;
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

async function confirmMaxBypassCombination(): Promise<boolean> {
  const cancel: vscode.MessageItem = {
    title: MAX_BYPASS_CANCEL_ACTION,
    isCloseAffordance: true,
  };
  const confirm: vscode.MessageItem = { title: MAX_BYPASS_CONFIRM_ACTION };
  const choice = await vscode.window.showWarningMessage(
    'Use Max reasoning with Bypass Permissions?',
    {
      modal: true,
      detail:
        'This combines the largest reasoning budget with an agent that can run enabled commands, use network-capable tools, and edit granted files without asking. It can consume plan limits faster and increases the impact of mistakes or prompt-injection attacks. Keep safer settings to leave your current mode and effort unchanged.',
    },
    cancel,
    confirm,
  );
  return choice?.title === MAX_BYPASS_CONFIRM_ACTION;
}

export function initializeAgentModeConsent(context: vscode.ExtensionContext): void {
  const storedConsent =
    context.globalState.get<number>(BYPASS_CONSENT_KEY) === BYPASS_CONSENT_VERSION;
  bypassConsentActive = storedConsent && configuredAgentMode() === 'bypass';
  if (storedConsent && !bypassConsentActive) {
    void context.globalState.update(BYPASS_CONSENT_KEY, undefined);
  }

  const storedMaxBypassConsent =
    context.globalState.get<number>(MAX_BYPASS_CONSENT_KEY) === MAX_BYPASS_CONSENT_VERSION;
  maxBypassConsentActive =
    storedMaxBypassConsent && bypassConsentActive && configuredAgentEffort() === 'max';
  if (storedMaxBypassConsent && !maxBypassConsentActive) {
    void context.globalState.update(MAX_BYPASS_CONSENT_KEY, undefined);
  }

  trustedConfigurationWrites = 0;
  trustedEffortWrites = 0;
  reconciliationQueue = Promise.resolve();
}

export function enforceAgentModeConsent(mode: ExtensionAgentMode): ExtensionAgentMode {
  return mode === 'bypass' && !bypassConsentActive ? 'auto' : mode;
}

export async function setAgentModeWithConsent(
  context: vscode.ExtensionContext,
  mode: ExtensionAgentMode,
): Promise<boolean> {
  const current = configuredAgentMode();
  const targetUsesMaxBypass = mode === 'bypass' && configuredAgentEffort() === 'max';
  const needsBypassConsent = mode === 'bypass' && (current !== 'bypass' || !bypassConsentActive);

  if (needsBypassConsent) {
    if (!(await confirmBypassPermissions())) return false;
  }
  if (targetUsesMaxBypass && !maxBypassConsentActive) {
    if (!(await confirmMaxBypassCombination())) return false;
  }

  await persistBypassConsent(context, mode === 'bypass');
  await persistMaxBypassConsent(context, targetUsesMaxBypass);

  await writeAgentMode(mode);
  return true;
}

export async function setAgentEffortWithConsent(
  context: vscode.ExtensionContext,
  effort: ExtensionAgentEffort,
): Promise<boolean> {
  const targetUsesMaxBypass =
    effort === 'max' && enforceAgentModeConsent(configuredAgentMode()) === 'bypass';

  if (targetUsesMaxBypass && !maxBypassConsentActive) {
    if (!(await confirmMaxBypassCombination())) return false;
  }

  await persistMaxBypassConsent(context, targetUsesMaxBypass);
  await writeAgentEffort(effort);
  return true;
}

export async function reconcileAgentModeConsent(context: vscode.ExtensionContext): Promise<void> {
  const configured = configuredAgentMode();
  if (configured !== 'bypass') {
    if (bypassConsentActive) await persistBypassConsent(context, false);
    return;
  }
  if (bypassConsentActive || trustedConfigurationWrites > 0) return;

  await writeAgentMode('auto');
  if (await setAgentModeWithConsent(context, 'bypass')) return;

  vscode.window.showInformationMessage(
    'AGI Workforce kept Auto mode. Bypass Permissions was not enabled.',
  );
}

export async function reconcileAgentEffortConsent(context: vscode.ExtensionContext): Promise<void> {
  const usesMaxBypass =
    configuredAgentEffort() === 'max' &&
    enforceAgentModeConsent(configuredAgentMode()) === 'bypass';

  if (!usesMaxBypass) {
    if (maxBypassConsentActive) await persistMaxBypassConsent(context, false);
    return;
  }
  if (maxBypassConsentActive || trustedEffortWrites > 0) return;

  await writeAgentEffort('high');
  if (await setAgentEffortWithConsent(context, 'max')) return;

  vscode.window.showInformationMessage(
    'AGI Workforce kept High reasoning effort. Max with Bypass Permissions was not enabled.',
  );
}

export async function reconcileAgentControlConsent(
  context: vscode.ExtensionContext,
): Promise<void> {
  const reconciliation = reconciliationQueue.then(async () => {
    await reconcileAgentModeConsent(context);
    await reconcileAgentEffortConsent(context);
  });
  reconciliationQueue = reconciliation.catch(() => undefined);
  return reconciliation;
}
