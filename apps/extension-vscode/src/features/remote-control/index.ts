import * as vscode from 'vscode';
import QRCode from 'qrcode';
import type { RemoteControlState } from '@agiworkforce/local-runtime-contract';
import { type LocalRuntimePool } from '../../integrations/localRuntimePool';
import { t, tPlural } from '../../l10n';
import { escapeHtml, getNonce } from '../sidebar-webview/webviewContent';
import { RemoteControlUnavailable, VscodeRemoteControl } from './remoteControlService';

export const REMOTE_CONTROL_COMMAND = 'agi-workforce.remoteControl';
export const STOP_REMOTE_CONTROL_COMMAND = 'agi-workforce.stopRemoteControl';
export const COPY_REMOTE_CONTROL_LINK_COMMAND = 'agi-workforce.copyRemoteControlLink';

const PANEL_VIEW_TYPE = 'agi-workforce.remoteControlPanel';
const PANEL_COMMANDS = [
  REMOTE_CONTROL_COMMAND,
  STOP_REMOTE_CONTROL_COMMAND,
  COPY_REMOTE_CONTROL_LINK_COMMAND,
] as const;

function phoneName(state: RemoteControlState): string {
  return state.phoneName ?? t('remote.yourPhone');
}

function commandLink(command: string, label: string): string {
  return `<a class="button" href="command:${command}">${escapeHtml(label)}</a>`;
}

function statusSection(state: RemoteControlState, qrSvg: string | null): string {
  switch (state.status) {
    case 'waiting':
      return [
        `<p>${escapeHtml(t('remote.howToPair'))}</p>`,
        qrSvg === null
          ? ''
          : `<div class="qr" role="img" aria-label="${escapeHtml(t('remote.qrLabel'))}">${qrSvg}</div>`,
        state.pairingCode === null
          ? ''
          : `<p class="code" aria-label="${escapeHtml(t('remote.pairingCode'))}">${escapeHtml(state.pairingCode)}</p>`,
      ].join('');
    case 'connected': {
      const attached =
        state.attachedSessions > 0
          ? ` ${escapeHtml(tPlural('remote.attached', state.attachedSessions))}`
          : '';
      return `<p>${escapeHtml(t('remote.connected', { phone: phoneName(state) }))}${attached}</p>`;
    }
    case 'reconnecting':
      return `<p>${escapeHtml(t('remote.reconnecting'))}</p>`;
    case 'error':
      return `<p class="error" role="alert">${escapeHtml(state.error ?? t('remote.pairFailed'))}</p>`;
    case 'idle':
      return '';
  }
}

function actions(state: RemoteControlState): string {
  switch (state.status) {
    case 'waiting':
      return [
        commandLink(COPY_REMOTE_CONTROL_LINK_COMMAND, t('remote.copyLink')),
        commandLink(STOP_REMOTE_CONTROL_COMMAND, t('remote.cancelPairing')),
      ].join('');
    case 'connected':
      return commandLink(STOP_REMOTE_CONTROL_COMMAND, t('remote.disconnect'));
    case 'reconnecting':
      return commandLink(STOP_REMOTE_CONTROL_COMMAND, t('remote.stop'));
    case 'error':
      return commandLink(REMOTE_CONTROL_COMMAND, t('remote.pairAgain'));
    case 'idle':
      return commandLink(REMOTE_CONTROL_COMMAND, t('remote.pair'));
  }
}

function renderPage(state: RemoteControlState, qrSvg: string | null): string {
  const nonce = getNonce();
  const title = escapeHtml(t('remote.title'));
  return `<!DOCTYPE html>
<html lang="${escapeHtml(vscode.env.language)}">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; img-src data:;">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style nonce="${nonce}">
body { color: var(--vscode-foreground); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); padding: 16px 24px; }
main { max-width: 520px; display: flex; flex-direction: column; gap: 12px; }
h1 { font-size: 1.4em; font-weight: 600; margin: 0; }
p { margin: 0; line-height: 1.5; }
.intro { color: var(--vscode-descriptionForeground); }
.qr { width: 220px; height: 220px; padding: 8px; background: #ffffff; border-radius: 6px; }
.qr svg { width: 100%; height: 100%; display: block; }
.code { font-family: var(--vscode-editor-font-family); font-size: 1.3em; letter-spacing: 0.2em; }
.error { color: var(--vscode-errorForeground); }
.actions { display: flex; flex-wrap: wrap; gap: 8px; }
.button { display: inline-flex; align-items: center; min-height: 28px; padding: 2px 12px; border-radius: 4px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); text-decoration: none; }
.button:hover { background: var(--vscode-button-hoverBackground); }
.button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
</style>
</head>
<body>
<main>
<h1>${title}</h1>
<p class="intro">${escapeHtml(t('remote.intro'))}</p>
<section aria-live="polite">${statusSection(state, qrSvg)}</section>
<div class="actions">${actions(state)}</div>
</main>
</body>
</html>`;
}

function statusBarText(state: RemoteControlState): string {
  switch (state.status) {
    case 'waiting':
      return `$(broadcast) ${t('remote.statusWaiting')}`;
    case 'connected':
      return `$(broadcast) ${t('remote.statusConnected', { phone: phoneName(state) })}`;
    case 'reconnecting':
      return `$(broadcast) ${t('remote.statusReconnecting')}`;
    case 'error':
      return `$(broadcast) ${t('remote.statusError')}`;
    case 'idle':
      return '';
  }
}

export function registerRemoteControl(
  context: vscode.ExtensionContext,
  runtimes: LocalRuntimePool,
): vscode.Disposable {
  const remote = new VscodeRemoteControl(context, runtimes);
  const statusBar = vscode.window.createStatusBarItem(
    'agi-workforce.remoteControl',
    vscode.StatusBarAlignment.Right,
    99,
  );
  statusBar.name = t('remote.title');
  statusBar.command = REMOTE_CONTROL_COMMAND;
  statusBar.tooltip = t('remote.statusTooltip');
  let panel: vscode.WebviewPanel | undefined;
  let render = 0;

  async function paint(state: RemoteControlState): Promise<void> {
    const text = statusBarText(state);
    if (text === '') statusBar.hide();
    else {
      statusBar.text = text;
      statusBar.show();
    }
    const target = panel;
    if (target === undefined) return;
    const attempt = ++render;
    const qrSvg =
      state.status === 'waiting' && state.qrPayload !== null
        ? await QRCode.toString(state.qrPayload, { type: 'svg', margin: 1, width: 220 }).catch(
            () => null,
          )
        : null;
    if (attempt !== render || panel !== target) return;
    target.webview.html = renderPage(state, qrSvg);
  }

  function showPanel(): void {
    if (panel !== undefined) {
      panel.reveal();
      return;
    }
    panel = vscode.window.createWebviewPanel(
      PANEL_VIEW_TYPE,
      t('remote.title'),
      vscode.ViewColumn.Active,
      { enableScripts: false, enableCommandUris: [...PANEL_COMMANDS], localResourceRoots: [] },
    );
    panel.onDidDispose(() => {
      panel = undefined;
    });
    void paint(remote.state());
  }

  async function startOrShow(): Promise<void> {
    if (remote.active()) {
      showPanel();
      return;
    }
    try {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: t('remote.starting') },
        () => remote.start(),
      );
      showPanel();
    } catch (error) {
      const message =
        error instanceof RemoteControlUnavailable
          ? error.message
          : t('remote.startFailed', {
              reason: error instanceof Error ? error.message : String(error),
            });
      await vscode.window.showWarningMessage(message);
    }
  }

  async function stop(): Promise<void> {
    const state = remote.state();
    if (state.status === 'connected' || state.status === 'reconnecting') {
      const disconnect = t('remote.disconnect');
      const choice = await vscode.window.showWarningMessage(
        t('remote.disconnectTitle', { phone: phoneName(state) }),
        { modal: true, detail: t('remote.disconnectConsequence') },
        disconnect,
      );
      if (choice !== disconnect) return;
    }
    remote.stop();
  }

  async function copyLink(): Promise<void> {
    const state = remote.state();
    if (state.status !== 'waiting' || state.qrPayload === null) {
      await vscode.window.showInformationMessage(t('remote.noPairing'));
      return;
    }
    await vscode.env.clipboard.writeText(state.qrPayload);
    await vscode.window.showInformationMessage(t('remote.linkCopied'));
  }

  return vscode.Disposable.from(
    remote,
    statusBar,
    remote.onDidChangeState((state) => void paint(state)),
    vscode.commands.registerCommand(REMOTE_CONTROL_COMMAND, startOrShow),
    vscode.commands.registerCommand(STOP_REMOTE_CONTROL_COMMAND, stop),
    vscode.commands.registerCommand(COPY_REMOTE_CONTROL_LINK_COMMAND, copyLink),
    { dispose: () => panel?.dispose() },
  );
}
