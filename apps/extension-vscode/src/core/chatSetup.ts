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
import {
  CLOUD_TASKS_VIEW_ID,
  CloudTasksTreeProvider,
  resolveCloudAgentRunClient,
} from '../features/cloud-tasks';
import {
  SCHEDULES_VIEW_ID,
  SchedulesTreeProvider,
  resolveSchedulesClient,
} from '../features/schedules';
import { type LocalRuntimePool } from '../integrations/localRuntimePool';

export interface ChatState {
  conversationTreeProvider: ConversationTreeProvider;
  cloudTasksTreeProvider: CloudTasksTreeProvider;
  schedulesTreeProvider: SchedulesTreeProvider;
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

  const cloudTasksTreeProvider = new CloudTasksTreeProvider(() =>
    resolveCloudAgentRunClient(context.secrets),
  );
  const cloudTasksView = vscode.window.createTreeView(CLOUD_TASKS_VIEW_ID, {
    treeDataProvider: cloudTasksTreeProvider,
  });
  cloudTasksTreeProvider.setAutoRefreshEnabled(cloudTasksView.visible);
  context.subscriptions.push(
    cloudTasksView.onDidChangeVisibility((event) => {
      cloudTasksTreeProvider.setAutoRefreshEnabled(event.visible);
    }),
    cloudTasksView,
    cloudTasksTreeProvider,
  );

  const schedulesTreeProvider = new SchedulesTreeProvider(() =>
    resolveSchedulesClient(context.secrets),
  );
  const schedulesView = vscode.window.createTreeView(SCHEDULES_VIEW_ID, {
    treeDataProvider: schedulesTreeProvider,
  });
  schedulesTreeProvider.setAutoRefreshEnabled(schedulesView.visible);
  context.subscriptions.push(
    schedulesView.onDidChangeVisibility((event) => {
      schedulesTreeProvider.setAutoRefreshEnabled(event.visible);
    }),
    schedulesView,
    schedulesTreeProvider,
  );

  const indexer = new WorkspaceIndexer(context);
  context.subscriptions.push(...indexer.registerFileWatcher());

  return {
    conversationTreeProvider,
    cloudTasksTreeProvider,
    schedulesTreeProvider,
    sidebarProvider,
    contextPanelProvider,
    memoryTreeProvider,
    nativeChatAvailable: chatParticipant !== undefined,
  };
}
