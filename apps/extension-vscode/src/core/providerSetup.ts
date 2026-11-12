import { PRODUCT_NAMES } from '@agiworkforce/types';
import * as vscode from 'vscode';
import { AgiCodeActionProvider, CODE_ACTION_KINDS } from '../providers/codeActionProvider';
import { AgiHoverProvider } from '../features/hover';
import { AgiInlineCompletionProvider } from '../features/inline-completions';
import {
  discloseInlineCompletions,
  inlineCompletionsDisclosed,
} from '../features/inline-completions/firstRunNotice';
import { AgiCodeLensProvider } from '../features/code-lens';
import { AgiDiagnosticsProvider } from '../providers/diagnosticsProvider';
import { DiffDecorationProvider } from '../providers/diffDecorationProvider';
import { activateTokenCounter } from '../data/tokenCounter';
import { activateTerminal } from '../providers/terminalProvider';
import { activateErrorExplainer } from '../providers/errorExplainerProvider';
import { Config } from '../platform/config';
import { registerPathLinks } from '../features/path-links';

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

  try {
    registerPathLinks(context);
  } catch (err) {
    console.warn(`[${PRODUCT_NAMES.code}] Path link providers init failed:`, err);
  }

  const codeLensProvider = new AgiCodeLensProvider();
  context.subscriptions.push(codeLensProvider);
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
    console.warn(`[${PRODUCT_NAMES.code}] CodeLens provider init failed:`, err);
  }

  const diagnosticsProvider = new AgiDiagnosticsProvider();
  context.subscriptions.push(diagnosticsProvider);

  try {
    activateTokenCounter(context);
  } catch (err) {
    console.warn(`[${PRODUCT_NAMES.code}] Token counter init failed:`, err);
  }

  try {
    activateTerminal(context, context.secrets);
  } catch (err) {
    console.warn(`[${PRODUCT_NAMES.code}] Terminal integration init failed:`, err);
  }

  try {
    activateErrorExplainer(context);
  } catch (err) {
    console.warn(`[${PRODUCT_NAMES.code}] Error explainer init failed:`, err);
  }

  let inlineCompletionRegistration: vscode.Disposable | undefined;
  let inlineCompletionDisclosure: Promise<void> | undefined;

  const syncInlineCompletionProvider = (): void => {
    if (!Config.inlineCompletionsEnabled()) {
      inlineCompletionRegistration?.dispose();
      inlineCompletionRegistration = undefined;
      return;
    }
    if (inlineCompletionRegistration !== undefined) return;
    if (!inlineCompletionsDisclosed(context.globalState)) {
      inlineCompletionDisclosure ??= discloseInlineCompletions(context.globalState)
        .catch((err: unknown) => {
          console.warn(`[${PRODUCT_NAMES.code}] Inline completion notice failed:`, err);
        })
        .finally(() => {
          inlineCompletionDisclosure = undefined;
          if (inlineCompletionsDisclosed(context.globalState)) syncInlineCompletionProvider();
        });
      return;
    }
    const provider = new AgiInlineCompletionProvider(context.secrets);
    inlineCompletionRegistration = vscode.Disposable.from(
      vscode.languages.registerInlineCompletionItemProvider({ scheme: 'file' }, provider),
      provider,
    );
    context.subscriptions.push(inlineCompletionRegistration);
  };

  try {
    syncInlineCompletionProvider();
  } catch (err) {
    console.warn(`[${PRODUCT_NAMES.code}] Inline completion provider init failed:`, err);
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

export function createDegradedProviderState(context: vscode.ExtensionContext): ProviderState {
  const diagnosticsProvider = new AgiDiagnosticsProvider();
  const diffDecorationProvider = new DiffDecorationProvider();
  const codeLensProvider = new AgiCodeLensProvider();
  context.subscriptions.push(diagnosticsProvider, diffDecorationProvider, codeLensProvider);

  return {
    diffDecorationProvider,
    diagnosticsProvider,
    codeLensProvider,
    syncCodeLensProvider: () => {},
    syncInlineCompletionProvider: () => {},
  };
}
