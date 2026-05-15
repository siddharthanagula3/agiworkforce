import * as vscode from 'vscode';
import { registerChatParticipant } from '../providers/chatParticipant';
import { SidebarProvider } from '../providers/sidebarProvider';
import { ConversationStore } from '../storage/conversationStore';
import { ConversationTreeProvider } from '../providers/conversationTreeProvider';
import { ContextPanelProvider, setContextPanelInstance } from '../providers/contextPanelProvider';
import { WorkspaceIndexer } from '../services/workspaceIndexer';

export interface ChatState {
  conversationStore: ConversationStore;
  conversationTreeProvider: ConversationTreeProvider;
  sidebarProvider: SidebarProvider;
  contextPanelProvider: ContextPanelProvider;
}

export function setupChat(context: vscode.ExtensionContext): ChatState {
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
