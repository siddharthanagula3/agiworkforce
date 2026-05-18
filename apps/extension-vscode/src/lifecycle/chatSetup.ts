import * as vscode from 'vscode';
import { registerChatParticipant } from '../features/chat-participant';
import { SidebarProvider } from '../features/sidebar-webview';
import { ConversationStore } from '../data/conversationStore';
import {
  ConversationTreeProvider,
  ContextPanelProvider,
  setContextPanelInstance,
} from '../features/trees';
import { type DiffDecorationProvider } from '../providers/diffDecorationProvider';
import { WorkspaceIndexer } from '../data/workspaceIndexer';

export interface ChatState {
  conversationStore: ConversationStore;
  conversationTreeProvider: ConversationTreeProvider;
  sidebarProvider: SidebarProvider;
  contextPanelProvider: ContextPanelProvider;
}

export function setupChat(
  context: vscode.ExtensionContext,
  diffDecorationProvider?: DiffDecorationProvider,
): ChatState {
  const conversationStore = new ConversationStore(context);
  const conversationTreeProvider = new ConversationTreeProvider(conversationStore);

  const chatParticipant = registerChatParticipant(
    context,
    conversationStore,
    conversationTreeProvider,
  );
  context.subscriptions.push(chatParticipant);

  const sidebarProvider = new SidebarProvider(
    context.extensionUri,
    context.secrets,
    context,
    conversationStore,
    conversationTreeProvider,
    context.workspaceState,
    diffDecorationProvider,
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewId, sidebarProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerTreeDataProvider('agi-workforce.conversations', conversationTreeProvider),
    conversationTreeProvider,
  );

  const contextPanelProvider = new ContextPanelProvider();
  setContextPanelInstance(contextPanelProvider);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('agi-workforce.contextPanel', contextPanelProvider),
    contextPanelProvider,
  );

  const indexer = new WorkspaceIndexer(context);
  context.subscriptions.push(...indexer.registerFileWatcher());

  return { conversationStore, conversationTreeProvider, sidebarProvider, contextPanelProvider };
}
