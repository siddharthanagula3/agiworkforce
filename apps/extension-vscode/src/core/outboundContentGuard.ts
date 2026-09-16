import * as vscode from 'vscode';
import { isSensitiveFile } from '@agiworkforce/utils';

const UNTRUSTED_REASON =
  'This workspace is not trusted, so its contents are not sent anywhere. Trust the workspace to use this command.';

const SENSITIVE_REASON =
  'This file matches the credential-file policy, so its contents are not sent anywhere. Copy the one value the question needs into a scratch file instead.';

export function describeOutboundRefusal(document?: vscode.TextDocument): string | null {
  if (!vscode.workspace.isTrusted) return UNTRUSTED_REASON;
  if (document === undefined) return null;
  if (document.uri.scheme !== 'file' && document.uri.scheme !== 'vscode-remote') return null;
  return isSensitiveFile(document.uri.fsPath) ? SENSITIVE_REASON : null;
}

export function mayLeaveTheMachine(document?: vscode.TextDocument): boolean {
  return describeOutboundRefusal(document) === null;
}
