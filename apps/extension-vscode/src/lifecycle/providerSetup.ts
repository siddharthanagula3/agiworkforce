import * as vscode from 'vscode';
import { AgiCodeActionProvider, CODE_ACTION_KINDS } from '../providers/codeActionProvider';
import { AgiHoverProvider } from '../providers/hoverProvider';
import { AgiInlineCompletionProvider } from '../providers/inlineCompletionProvider';
import { AgiCodeLensProvider } from '../providers/codeLensProvider';
import { AgiDiagnosticsProvider } from '../providers/diagnosticsProvider';
import { DiffDecorationProvider } from '../providers/diffDecorationProvider';
import { activateTokenCounter } from '../services/tokenCounter';
import { activateTerminal } from '../providers/terminalProvider';
import { activateErrorExplainer } from '../providers/errorExplainerProvider';
import { Config } from '../utils/config';

export interface ProviderState {
  diffDecorationProvider: DiffDecorationProvider;
  diagnosticsProvider: AgiDiagnosticsProvider;
  codeLensProvider: AgiCodeLensProvider;
  syncCodeLensProvider: () => void;
  syncInlineCompletionProvider: () => void;
}

export function setupProviders(context: vscode.ExtensionContext): ProviderState {
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider('*', new AgiCodeActionProvider(), {
      providedCodeActionKinds: [...CODE_ACTION_KINDS],
    }),
    vscode.languages.registerHoverProvider('*', new AgiHoverProvider()),
  );

  const codeLensProvider = new AgiCodeLensProvider();
  let codeLensRegistration: vscode.Disposable | undefined;

  const syncCodeLensProvider = (): void => {
    if (!Config.codeLensEnabled()) {
      codeLensRegistration?.dispose();
      codeLensRegistration = undefined;
      return;
    }
    if (codeLensRegistration !== undefined) return;
    codeLensRegistration = vscode.languages.registerCodeLensProvider('*', codeLensProvider);
    context.subscriptions.push(codeLensRegistration);
  };

  try {
    syncCodeLensProvider();
  } catch (err) {
    console.warn('[AGI Workforce] CodeLens provider init failed:', err);
  }

  const diagnosticsProvider = new AgiDiagnosticsProvider();
  context.subscriptions.push(diagnosticsProvider);

  try {
    activateTokenCounter(context);
  } catch (err) {
    console.warn('[AGI Workforce] Token counter init failed:', err);
  }

  try {
    activateTerminal(context, context.secrets);
  } catch (err) {
    console.warn('[AGI Workforce] Terminal integration init failed:', err);
  }

  try {
    activateErrorExplainer(context);
  } catch (err) {
    console.warn('[AGI Workforce] Error explainer init failed:', err);
  }

  let inlineCompletionRegistration: vscode.Disposable | undefined;

  const syncInlineCompletionProvider = (): void => {
    if (!Config.inlineCompletionsEnabled()) {
      inlineCompletionRegistration?.dispose();
      inlineCompletionRegistration = undefined;
      return;
    }
    if (inlineCompletionRegistration !== undefined) return;
    inlineCompletionRegistration = vscode.languages.registerInlineCompletionItemProvider(
      { pattern: '**' },
      new AgiInlineCompletionProvider(context.secrets),
    );
    context.subscriptions.push(inlineCompletionRegistration);
  };

  try {
    syncInlineCompletionProvider();
  } catch (err) {
    console.warn('[AGI Workforce] Inline completion provider init failed:', err);
  }

  const diffDecorationProvider = new DiffDecorationProvider();
  context.subscriptions.push(
    diffDecorationProvider,
    vscode.languages.registerCodeLensProvider('*', diffDecorationProvider.codeLensProvider),
  );

  return {
    diffDecorationProvider,
    diagnosticsProvider,
    codeLensProvider,
    syncCodeLensProvider,
    syncInlineCompletionProvider,
  };
}
