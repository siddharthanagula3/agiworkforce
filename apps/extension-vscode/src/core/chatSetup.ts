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
import { CloudTasksTreeProvider, resolveCloudAgentRunClient } from '../features/cloud-tasks';
import { SchedulesTreeProvider, resolveSchedulesClient } from '../features/schedules';
import { ProjectsTreeProvider, resolveProjectsWorkspace } from '../features/projects';
import {
  ArtifactContentProvider,
  ARTIFACT_SCHEME,
  ArtifactsTreeProvider,
  resolveArtifactsWorkspace,
} from '../features/artifacts';
import { ConnectorsTreeProvider, resolveConnectorsClient } from '../features/connectors';
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
    conversationTreeProvider,
  );

  const contextPanelProvider = new ContextPanelProvider(context);
  setContextPanelInstance(contextPanelProvider);
  context.subscriptions.push(contextPanelProvider);

  const accountMemoryStore = new AccountMemoryStore(
    context.globalState,
    context.secrets,
    context.workspaceState,
  );
  setAccountMemoryStore(accountMemoryStore);
  const memoryTreeProvider = new MemoryTreeProvider(accountMemoryStore);
  context.subscriptions.push(
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
  context.subscriptions.push(cloudTasksTreeProvider);

  const schedulesTreeProvider = new SchedulesTreeProvider(() =>
    resolveSchedulesClient(context.secrets),
  );
  context.subscriptions.push(schedulesTreeProvider);

  const projectsTreeProvider = new ProjectsTreeProvider(async () => {
    const resolution = await resolveProjectsWorkspace(context.secrets);
    return resolution.status === 'signed-out'
      ? { status: 'signed-out' }
      : { status: 'ready', client: resolution.workspace.projects };
  });
  context.subscriptions.push(projectsTreeProvider);

  const artifactContentProvider = new ArtifactContentProvider();
  const artifactsTreeProvider = new ArtifactsTreeProvider(async () => {
    const resolution = await resolveArtifactsWorkspace(context.secrets);
    return resolution.status === 'signed-out'
      ? { status: 'signed-out' }
      : { status: 'ready', client: resolution.workspace.index };
  });
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(ARTIFACT_SCHEME, artifactContentProvider),
    artifactsTreeProvider,
    artifactContentProvider,
  );

  const connectorsTreeProvider = new ConnectorsTreeProvider(() =>
    resolveConnectorsClient(context.secrets),
  );
  context.subscriptions.push(connectorsTreeProvider);

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
