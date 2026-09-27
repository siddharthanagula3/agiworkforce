import * as vscode from 'vscode';

export const CLI_INSTALL_COMMAND = 'curl -fsSL https://agiworkforce.com/install.sh | bash';

const CLI_RELEASE_FEED_URL = 'https://agiworkforce.com/api/releases/cli/latest';
const RELEASE_CHECK_TIMEOUT_MS = 10_000;
const INSTALL_TERMINAL_NAME = 'Install AGI CLI';

export type CliReleaseState = 'published' | 'unpublished' | 'unreachable';

export async function cliReleaseState(fetchImpl: typeof fetch = fetch): Promise<CliReleaseState> {
  try {
    const response = await fetchImpl(CLI_RELEASE_FEED_URL, {
      signal: AbortSignal.timeout(RELEASE_CHECK_TIMEOUT_MS),
    });
    if (response.status === 404) return 'unpublished';
    return response.ok ? 'published' : 'unreachable';
  } catch {
    return 'unreachable';
  }
}

function runInstallerInTerminal(): Promise<number | undefined> {
  const terminal = vscode.window.createTerminal({
    name: INSTALL_TERMINAL_NAME,
    shellPath: 'bash',
    shellArgs: [
      '-c',
      `set -o pipefail; ${CLI_INSTALL_COMMAND}; status=$?; echo; read -r -p 'Press Enter to close this terminal.' _; exit $status`,
    ],
  });
  terminal.show();
  return new Promise((resolve) => {
    const subscription = vscode.window.onDidCloseTerminal((closed) => {
      if (closed !== terminal) return;
      subscription.dispose();
      resolve(closed.exitStatus?.code);
    });
  });
}

export async function installCli(): Promise<boolean> {
  const release = await cliReleaseState();
  if (release === 'unpublished') {
    void vscode.window.showInformationMessage(
      'AGI Workforce: No signed AGI CLI release is published yet, so there is nothing to install. Set agiWorkforce.cliPath to an AGI CLI you built from source.',
    );
    return false;
  }
  if (release === 'unreachable') {
    void vscode.window.showErrorMessage(
      'AGI Workforce: Could not reach agiworkforce.com to find the AGI CLI release. Check the connection, then try again.',
    );
    return false;
  }
  if (process.platform === 'win32') {
    const choice = await vscode.window.showInformationMessage(
      `AGI Workforce: The AGI CLI installer runs in Git Bash or WSL. Run this there, then reload VS Code: ${CLI_INSTALL_COMMAND}`,
      'Copy command',
    );
    if (choice === 'Copy command') await vscode.env.clipboard.writeText(CLI_INSTALL_COMMAND);
    return false;
  }
  const exitCode = await runInstallerInTerminal();
  if (exitCode !== 0) {
    void vscode.window.showErrorMessage(
      'AGI Workforce: The AGI CLI installer did not finish. Its terminal output says why.',
    );
    return false;
  }
  return true;
}
