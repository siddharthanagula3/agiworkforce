import * as vscode from 'vscode';
import { realpathSync } from 'node:fs';
import { isCredentialPath } from '@agiworkforce/local-runtime-contract';

const UNTRUSTED_REASON =
  'This workspace is not trusted, so its contents are not sent anywhere. Trust the workspace to use this command.';

const SENSITIVE_REASON =
  'This file matches the credential-file policy, so its contents are not sent anywhere. Copy the one value the question needs into a scratch file instead.';

const UNRESOLVED_REASON =
  'This file could not be safely resolved, so its contents are not sent anywhere. Save it to an accessible file and try again.';

export function describeOutboundRefusal(document?: vscode.TextDocument): string | null {
  if (!vscode.workspace.isTrusted) return UNTRUSTED_REASON;
  if (document === undefined) return null;
  if (document.uri.scheme !== 'file' && document.uri.scheme !== 'vscode-remote') return null;
  if (isCredentialPath(document.uri.fsPath)) return SENSITIVE_REASON;
  try {
    // This workspace extension resolves both disk URI schemes on the workspace host.
    const resolvedPath = realpathSync(document.uri.fsPath);
    return isCredentialPath(resolvedPath) ? SENSITIVE_REASON : null;
  } catch {
    return UNRESOLVED_REASON;
  }
}
