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
import { AccountMemoryStore, setAccountMemoryStore } from '../memory/accountMemoryStore';
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
import {
  PROJECTS_VIEW_ID,
  ProjectsTreeProvider,
  resolveProjectsWorkspace,
} from '../features/projects';
import {
  ARTIFACTS_VIEW_ID,
  ArtifactContentProvider,
  ARTIFACT_SCHEME,
  ArtifactsTreeProvider,
  resolveArtifactsWorkspace,
} from '../features/artifacts';
import {
  CONNECTORS_VIEW_ID,
  ConnectorsTreeProvider,
  resolveConnectorsClient,
} from '../features/connectors';
import { type LocalRuntimePool } from '../integrations/localRuntimePool';

export interface ChatState {
  conversationTreeProvider: ConversationTreeProvider;
  cloudTasksTreeProvider: CloudTasksTreeProvider;
  schedulesTreeProvider: SchedulesTreeProvider;
  projectsTreeProvider: ProjectsTreeProvider;
  artifactsTreeProvider: ArtifactsTreeProvider;
  artifactContentProvider: ArtifactContentProvider;
  connectorsTreeProvider: ConnectorsTreeProvider;
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

  const accountMemoryStore = new AccountMemoryStore(
    context.globalState,
    context.secrets,
    context.workspaceState,
  );
  setAccountMemoryStore(accountMemoryStore);
  const memoryTreeProvider = new MemoryTreeProvider(accountMemoryStore);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('agi-workforce.memory', memoryTreeProvider),
    memoryTreeProvider,
    accountMemoryStore,
    new vscode.Disposable(() => {
      setAccountMemoryStore(undefined);
    }),
  );
  void memoryTreeProvider.refresh();

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

  const projectsTreeProvider = new ProjectsTreeProvider(async () => {
    const resolution = await resolveProjectsWorkspace(context.secrets);
    return resolution.status === 'signed-out'
      ? { status: 'signed-out' }
      : { status: 'ready', client: resolution.workspace.projects };
  });
  const projectsView = vscode.window.createTreeView(PROJECTS_VIEW_ID, {
    treeDataProvider: projectsTreeProvider,
  });
  projectsTreeProvider.setAutoRefreshEnabled(projectsView.visible);
  context.subscriptions.push(
    projectsView.onDidChangeVisibility((event) => {
      projectsTreeProvider.setAutoRefreshEnabled(event.visible);
    }),
    projectsView,
    projectsTreeProvider,
  );

  const artifactContentProvider = new ArtifactContentProvider();
  const artifactsTreeProvider = new ArtifactsTreeProvider(async () => {
    const resolution = await resolveArtifactsWorkspace(context.secrets);
    return resolution.status === 'signed-out'
      ? { status: 'signed-out' }
      : { status: 'ready', client: resolution.workspace.index };
  });
  const artifactsView = vscode.window.createTreeView(ARTIFACTS_VIEW_ID, {
    treeDataProvider: artifactsTreeProvider,
  });
  artifactsTreeProvider.setAutoRefreshEnabled(artifactsView.visible);
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(ARTIFACT_SCHEME, artifactContentProvider),
    artifactsView.onDidChangeVisibility((event) => {
      artifactsTreeProvider.setAutoRefreshEnabled(event.visible);
    }),
    artifactsView,
    artifactsTreeProvider,
    artifactContentProvider,
  );

  const connectorsTreeProvider = new ConnectorsTreeProvider(() =>
    resolveConnectorsClient(context.secrets),
  );
  const connectorsView = vscode.window.createTreeView(CONNECTORS_VIEW_ID, {
    treeDataProvider: connectorsTreeProvider,
  });
  connectorsTreeProvider.setAutoRefreshEnabled(connectorsView.visible);
  context.subscriptions.push(
    connectorsView.onDidChangeVisibility((event) => {
      connectorsTreeProvider.setAutoRefreshEnabled(event.visible);
    }),
    connectorsView,
    connectorsTreeProvider,
  );

  const indexer = new WorkspaceIndexer(context);
  context.subscriptions.push(...indexer.registerFileWatcher());

  return {
    conversationTreeProvider,
    cloudTasksTreeProvider,
    schedulesTreeProvider,
    projectsTreeProvider,
    artifactsTreeProvider,
    artifactContentProvider,
    connectorsTreeProvider,
    sidebarProvider,
    contextPanelProvider,
    memoryTreeProvider,
    nativeChatAvailable: chatParticipant !== undefined,
  };
}
