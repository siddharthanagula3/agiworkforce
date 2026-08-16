import * as vscode from 'vscode';
import { registerChatParticipant } from '../features/chat-participant';
import { SidebarProvider } from '../features/sidebar-webview';
import {
  ConversationTreeProvider,
  ContextPanelProvider,
  setContextPanelInstance,
} from '../features/trees';
import { type DiffDecorationProvider } from '../providers/diffDecorationProvider';
import { WorkspaceIndexer } from '../data/workspaceIndexer';
import { MemoryTreeProvider } from '../memory/memoryTreeProvider';
import { type LocalRuntimePool } from '../integrations/localRuntimePool';

export interface ChatState {
  conversationTreeProvider: ConversationTreeProvider;
  sidebarProvider: SidebarProvider;
  contextPanelProvider: ContextPanelProvider;
  memoryTreeProvider: MemoryTreeProvider;
  nativeChatAvailable: boolean;
}

export function setupChat(
  context: vscode.ExtensionContext,
  localRuntimes: LocalRuntimePool,
  diffDecorationProvider?: DiffDecorationProvider,
): ChatState {
  const conversationTreeProvider = new ConversationTreeProvider(localRuntimes);

  const chatParticipant = registerChatParticipant(context, conversationTreeProvider, localRuntimes);
  if (chatParticipant !== undefined) context.subscriptions.push(chatParticipant);

  const sidebarProvider = new SidebarProvider(
    context.extensionUri,
    context.secrets,
    context,
    conversationTreeProvider,
    context.workspaceState,
    localRuntimes,
    diffDecorationProvider,
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewId, sidebarProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerTreeDataProvider('agi-workforce.conversations', conversationTreeProvider),
    conversationTreeProvider,
  );

  const contextPanelProvider = new ContextPanelProvider(context);
  setContextPanelInstance(contextPanelProvider);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('agi-workforce.contextPanel', contextPanelProvider),
    contextPanelProvider,
  );

  const memoryTreeProvider = new MemoryTreeProvider(context.workspaceState);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('agi-workforce.memory', memoryTreeProvider),
    memoryTreeProvider,
  );

  const indexer = new WorkspaceIndexer(context);
  context.subscriptions.push(...indexer.registerFileWatcher());

  return {
    conversationTreeProvider,
    sidebarProvider,
    contextPanelProvider,
    memoryTreeProvider,
    nativeChatAvailable: chatParticipant !== undefined,
  };
}
