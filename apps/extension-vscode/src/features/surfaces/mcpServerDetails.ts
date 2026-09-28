import * as vscode from 'vscode';
import { stripTerminalControlSequences } from '@agiworkforce/ide-runtime';
import type { McpServerInspection } from '../../integrations/localRuntimeClient';
import { t } from '../../l10n';

export const MCP_SERVER_DETAILS_SCHEME = 'agi-mcp-server';

function detailsUri(name: string): vscode.Uri {
  return vscode.Uri.parse(
    `${MCP_SERVER_DETAILS_SCHEME}:/${encodeURIComponent(t('mcpDetails.documentTitle', { name }))}?name=${encodeURIComponent(name)}`,
  );
}

function printable(text: string): string {
  return stripTerminalControlSequences(text).trimEnd();
}

function health(report: McpServerInspection): string {
  if (!report.connected) return t('mcpDetails.notConnected');
  return report.responding ? t('mcpDetails.responding') : t('mcpDetails.notResponding');
}

function field(label: string, value: string): string {
  return t('mcpDetails.field', { label, value });
}

function section(heading: string, lines: readonly string[]): string[] {
  return ['', heading, ...lines.map((line) => `  ${line}`)];
}

export function renderMcpServerDetails(report: McpServerInspection, checkedAt: Date): string {
  const notReported = t('mcpDetails.notReported');
  const server = [report.serverName, report.serverVersion]
    .filter((part): part is string => part !== undefined && part.trim() !== '')
    .map(printable)
    .join(' ');
  const lines = [report.name, '', field(t('mcpDetails.health'), health(report))];
  if (report.connected) {
    lines.push(
      field(t('mcpDetails.connection'), report.live ? t('mcpDetails.live') : t('mcpDetails.probe')),
      field(
        t('mcpDetails.protocol'),
        report.protocolVersion === undefined ? notReported : printable(report.protocolVersion),
      ),
      field(t('mcpDetails.server'), server === '' ? notReported : server),
      field(
        t('mcpDetails.capabilities'),
        report.capabilities.length === 0
          ? t('mcpDetails.noCapabilities')
          : report.capabilities.map(printable).join(', '),
      ),
    );
  }
  if (report.error !== undefined) lines.push(field(t('mcpDetails.error'), printable(report.error)));
  lines.push(t('mcpDetails.checkedAt', { time: checkedAt.toLocaleString(vscode.env.language) }));
  const instructions = printable(report.instructions ?? '').trim();
  if (instructions !== '') {
    lines.push(...section(t('mcpDetails.instructions'), instructions.split('\n')));
  }
  lines.push(
    ...section(
      t('mcpDetails.output'),
      report.logs.length === 0 ? [t('mcpDetails.noOutput')] : report.logs.map(printable),
    ),
  );
  return `${lines.join('\n')}\n`;
}

export class McpServerDetailsProvider
  implements vscode.TextDocumentContentProvider, vscode.Disposable
{
  private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;
  private readonly contents = new Map<string, string>();

  provideTextDocumentContent(uri: vscode.Uri): string {
    const name = new URLSearchParams(uri.query).get('name') ?? '';
    return this.contents.get(name) ?? `${t('mcpDetails.expired', { name })}\n`;
  }

  async show(report: McpServerInspection): Promise<void> {
    const uri = detailsUri(report.name);
    this.contents.set(report.name, renderMcpServerDetails(report, new Date()));
    this._onDidChange.fire(uri);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, { preview: true });
  }

  dispose(): void {
    this.contents.clear();
    this._onDidChange.dispose();
  }
}
