import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { open } from '@tauri-apps/plugin-shell';
import { CalendarDays, CheckSquare, ExternalLink, Plus, RefreshCcw, Tag, User } from 'lucide-react';

import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/Dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';
import { ScrollArea } from '../ui/ScrollArea';
import { Badge } from '../ui/Badge';
import { useProductivityStore } from '../../stores/productivityStore';
import type { ProductivityProvider, Task, CreateTaskRequest } from '../../types/productivity';

interface ProductivityWorkspaceProps {
  className?: string;
}

const PROVIDER_OPTIONS: Array<{ value: ProductivityProvider; label: string }> = [
  { value: 'notion', label: 'Notion' },
  { value: 'trello', label: 'Trello' },
  { value: 'asana', label: 'Asana' },
];

const TASK_STATUS_LABELS: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  completed: 'Completed',
  blocked: 'Blocked',
  cancelled: 'Cancelled',
};

const extractNotionTitle = (page: any): string | null => {
  const properties = page?.properties;
  if (!properties) return null;
  for (const value of Object.values<any>(properties)) {
    if (value?.type === 'title' && Array.isArray(value.title)) {
      const text = value.title.find((item: any) => item?.plain_text)?.plain_text;
      if (text) {
        return text;
      }
    }
  }
  return null;
};

export function ProductivityWorkspace({ className }: ProductivityWorkspaceProps) {
  const {
    connectedProviders,
    selectedProvider,
    tasks,
    loading,
    error,
    connect,
    selectProvider,
    refreshTasks,
    createTask,
    // Notion actions
    notionPages,
    notionListPages,
    // Trello actions
    trelloBoards,
    trelloListBoards,
    trelloCards,
    trelloListCards,
    // Asana actions
    asanaProjects,
    asanaTasks,
    asanaListProjectTasks,
    asanaWorkspaceId,
    setAsanaWorkspace,
    asanaListProjects,
  } = useProductivityStore();

  const [connectOpen, setConnectOpen] = useState(false);
  const [connectProvider, setConnectProvider] = useState<ProductivityProvider>('notion');
  const [credentialsForm, setCredentialsForm] = useState({
    token: '',
    apiKey: '',
    workspaceId: '',
  });

  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [taskForm, setTaskForm] = useState<CreateTaskRequest>({
    title: '',
    description: '',
    project_id: '',
  });

  const [selectedBoardId, setSelectedBoardId] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [workspaceInput, setWorkspaceInput] = useState('');

  const selectedProviderLabel = useMemo(() => {
    if (!selectedProvider) return null;
    return PROVIDER_OPTIONS.find((p) => p.value === selectedProvider)?.label ?? null;
  }, [selectedProvider]);

  useEffect(() => {
    if (error) {
      console.error('[productivity]', error);
    }
  }, [error]);

  useEffect(() => {
    setSelectedBoardId('');
    setSelectedProjectId('');
  }, [selectedProvider]);

  useEffect(() => {
    setWorkspaceInput(asanaWorkspaceId ?? '');
  }, [asanaWorkspaceId]);

  const handleConnect = async () => {
    if (connectProvider === 'notion' && !credentialsForm.token) {
      toast.error('Notion token is required');
      return;
    }
    if (connectProvider === 'trello' && (!credentialsForm.apiKey || !credentialsForm.token)) {
      toast.error('Trello API key and token are required');
      return;
    }
    if (connectProvider === 'asana' && !credentialsForm.token) {
      toast.error('Asana token is required');
      return;
    }

    try {
      const credentials =
        connectProvider === 'trello'
          ? { api_key: credentialsForm.apiKey, token: credentialsForm.token }
          : connectProvider === 'asana'
            ? {
                token: credentialsForm.token,
                workspace_id: credentialsForm.workspaceId.trim() || undefined,
              }
            : { token: credentialsForm.token };

      await connect(connectProvider, credentials);
      setConnectOpen(false);
      setCredentialsForm({ token: '', apiKey: '', workspaceId: '' });
    } catch {
      // Handled in store
    }
  };

  const handleRefresh = async () => {
    if (selectedProvider) {
      await refreshTasks();

      if (selectedProvider === 'notion') {
        await notionListPages();
      } else if (selectedProvider === 'trello') {
        await trelloListBoards();
        if (selectedBoardId) {
          await trelloListCards(selectedBoardId);
        }
      } else if (selectedProvider === 'asana') {
        await asanaListProjects();
        if (selectedProjectId) {
          await asanaListProjectTasks(selectedProjectId);
        }
      }
    }
  };

  const handleCreateTask = async () => {
    if (!taskForm.title.trim()) {
      toast.error('Task title is required');
      return;
    }

    try {
      await createTask(taskForm);
      setCreateTaskOpen(false);
      setTaskForm({ title: '', description: '', project_id: '' });
    } catch {
      // Handled in store
    }
  };

  const handleBoardSelect = async (boardId: string) => {
    setSelectedBoardId(boardId);
    await trelloListCards(boardId);
  };

  const handleProjectSelect = async (projectId: string) => {
    setSelectedProjectId(projectId);
    await asanaListProjectTasks(projectId);
  };

  const handleWorkspaceApply = async () => {
    const trimmed = workspaceInput.trim();
    if (!trimmed) {
      toast.error('Workspace ID cannot be empty');
      return;
    }

    await setAsanaWorkspace(trimmed);
  };

  const renderTaskList = (taskList: Task[]) => {
    if (taskList.length === 0) {
      return (
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          No tasks found. Create your first task to get started.
        </div>
      );
    }

    const statusBadge = (status: Task['status']) => (
      <Badge
        variant="outline"
        className={cn(
          'border-transparent',
          status === 'completed' && 'bg-green-500/10 text-green-500',
          status === 'in_progress' && 'bg-blue-500/10 text-blue-500',
          status === 'todo' && 'bg-gray-500/10 text-gray-500',
          status === 'blocked' && 'bg-red-500/10 text-red-500',
          status === 'cancelled' && 'bg-gray-500/10 text-gray-500',
        )}
      >
        {TASK_STATUS_LABELS[status] ?? status}
      </Badge>
    );

    const formatDueDate = (value?: string | null) => {
      if (!value) return null;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return null;
      return date.toLocaleDateString();
    };

    return (
      <div className="space-y-2">
        {taskList.map((task) => (
          <div
            key={task.id}
            className="rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/50"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium leading-tight">{task.title}</h4>
                  {statusBadge(task.status)}
                </div>
                {task.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {task.project_name && (
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      {task.project_name}
                    </span>
                  )}
                  {task.assignee && (
                    <span className="inline-flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {task.assignee}
                    </span>
                  )}
                  {formatDueDate(task.due_date) && (
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      Due {formatDueDate(task.due_date)}
                    </span>
                  )}
                  {task.tags.length > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Tag className="h-3 w-3" />
                      {task.tags.slice(0, 3).join(', ')}
                    </span>
                  )}
                </div>
              </div>
              {task.url && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => void open(task.url!)}
                  title="Open in provider"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={cn('flex h-full bg-background', className)}>
      {/* Sidebar */}
      <aside className="w-72 border-r border-border/80 bg-muted/10">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-semibold leading-tight">Productivity</p>
              <p className="text-xs text-muted-foreground">Manage tasks & projects</p>
            </div>
          </div>
          <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
            <DialogTrigger asChild>
              <Button size="icon" variant="outline">
                <Plus className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Connect Productivity Provider</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground">
                    Provider
                  </label>
                  <select
                    value={connectProvider}
                    onChange={(e) => setConnectProvider(e.target.value as ProductivityProvider)}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {PROVIDER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {connectProvider === 'trello' && (
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground">
                      API Key
                    </label>
                    <Input
                      value={credentialsForm.apiKey}
                      onChange={(e) =>
                        setCredentialsForm((prev) => ({ ...prev, apiKey: e.target.value }))
                      }
                      placeholder="Trello API key"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-muted-foreground">
                    {connectProvider === 'trello' ? 'Token' : 'Access Token'}
                  </label>
                  <Input
                    type="password"
                    value={credentialsForm.token}
                    onChange={(e) =>
                      setCredentialsForm((prev) => ({ ...prev, token: e.target.value }))
                    }
                    placeholder={`${connectProvider === 'notion' ? 'Notion' : connectProvider === 'trello' ? 'Trello' : 'Asana'} token`}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConnectOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleConnect} disabled={loading}>
                  Connect
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Provider Selection */}
        <ScrollArea className="h-[calc(100vh-120px)]">
          <div className="space-y-1 px-2 py-2">
            {PROVIDER_OPTIONS.map((provider) => {
              const isConnected = connectedProviders.has(provider.value);
              const isSelected = selectedProvider === provider.value;

              return (
                <button
                  key={provider.value}
                  onClick={() => isConnected && selectProvider(provider.value)}
                  disabled={!isConnected}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                    isSelected
                      ? 'bg-primary/10 text-primary font-medium'
                      : isConnected
                        ? 'hover:bg-accent text-foreground'
                        : 'text-muted-foreground opacity-50 cursor-not-allowed',
                  )}
                >
                  <span>{provider.label}</span>
                  {isConnected && (
                    <span className="h-2 w-2 rounded-full bg-green-500" title="Connected" />
                  )}
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </aside>

      {/* Main Content */}
      <main className="flex flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold">
              {selectedProviderLabel ?? 'Select a Provider'}
            </h2>
            {selectedProvider && (
              <p className="text-xs text-muted-foreground">
                {tasks.length} task{tasks.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          {selectedProvider && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleRefresh} disabled={loading}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
              <Dialog open={createTaskOpen} onOpenChange={setCreateTaskOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Create Task
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Task</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground">
                        Title
                      </label>
                      <Input
                        value={taskForm.title}
                        onChange={(e) =>
                          setTaskForm((prev) => ({ ...prev, title: e.target.value }))
                        }
                        placeholder="Task title"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground">
                        Description
                      </label>
                      <Textarea
                        value={taskForm.description || ''}
                        onChange={(e) =>
                          setTaskForm((prev) => ({ ...prev, description: e.target.value }))
                        }
                        placeholder="Task description"
                        rows={3}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCreateTaskOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateTask} disabled={loading}>
                      Create
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>

        {/* Content Area */}
        <ScrollArea className="flex-1 p-4">
          {!selectedProvider ? (
            <div className="flex h-full items-center justify-center text-center">
              <div className="space-y-2">
                <CheckSquare className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  Connect a productivity provider to manage tasks
                </p>
                <Button variant="outline" onClick={() => setConnectOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Connect Provider
                </Button>
              </div>
            </div>
          ) : (
            <Tabs defaultValue="tasks" className="w-full">
              <TabsList>
                <TabsTrigger value="tasks">Tasks</TabsTrigger>
                {selectedProvider === 'notion' && <TabsTrigger value="pages">Pages</TabsTrigger>}
                {selectedProvider === 'trello' && <TabsTrigger value="boards">Boards</TabsTrigger>}
                {selectedProvider === 'asana' && (
                  <TabsTrigger value="projects">Projects</TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="tasks" className="mt-4">
                {renderTaskList(tasks)}
              </TabsContent>

              {selectedProvider === 'notion' && (
                <TabsContent value="pages" className="mt-4">
                  {notionPages.length === 0 ? (
                    <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                      No pages found
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {notionPages.map((page) => (
                        <div
                          key={page.id}
                          className="rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/50"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">
                              {extractNotionTitle(page) ?? `Page ${page.id}`}
                            </span>
                            <Button size="sm" variant="ghost" onClick={() => void open(page.url)}>
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              )}

              {selectedProvider === 'trello' && (
                <TabsContent value="boards" className="mt-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Select Board</label>
                      {trelloBoards.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No boards found</p>
                      ) : (
                        <select
                          value={selectedBoardId}
                          onChange={(e) => handleBoardSelect(e.target.value)}
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                        >
                          <option value="">Choose a board...</option>
                          {trelloBoards.map((board) => (
                            <option key={board.id} value={board.id}>
                              {board.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    {selectedBoardId && trelloCards.length > 0 && (
                      <div className="space-y-2">
                        <h3 className="text-sm font-medium">Cards</h3>
                        {trelloCards.map((card) => (
                          <div
                            key={card.id}
                            className="rounded-lg border border-border bg-card p-3"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <h4 className="text-sm font-medium">{card.name}</h4>
                                {card.desc && (
                                  <p className="mt-1 text-xs text-muted-foreground">{card.desc}</p>
                                )}
                              </div>
                              <Button size="sm" variant="ghost" onClick={() => void open(card.url)}>
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>
              )}

              {selectedProvider === 'asana' && (
                <TabsContent value="projects" className="mt-4">
                  <div className="space-y-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                      <div className="flex-1 space-y-1">
                        <label className="text-sm font-medium">Workspace ID</label>
                        <Input
                          value={workspaceInput}
                          onChange={(e) => setWorkspaceInput(e.target.value)}
                          placeholder="Enter Asana workspace ID"
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={loading || workspaceInput.trim().length === 0}
                        onClick={() => void handleWorkspaceApply()}
                      >
                        Load Projects
                      </Button>
                    </div>

                    {asanaProjects.length === 0 ? (
                      <div className="flex h-64 items-center justify-center text-center text-sm text-muted-foreground">
                        <p>
                          Projects will appear here after loading them for the selected workspace.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Select Project</label>
                          <select
                            value={selectedProjectId}
                            onChange={(e) => handleProjectSelect(e.target.value)}
                            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                          >
                            <option value="">Choose a project...</option>
                            {asanaProjects.map((project) => (
                              <option key={project.gid} value={project.gid}>
                                {project.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {selectedProjectId ? (
                          asanaTasks.length > 0 ? (
                            <div className="space-y-2">
                              <h3 className="text-sm font-medium">Project Tasks</h3>
                              {asanaTasks.map((task) => (
                                <div
                                  key={task.gid}
                                  className="rounded-lg border border-border bg-card p-3"
                                >
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <h4 className="text-sm font-medium">{task.name}</h4>
                                      {task.notes && (
                                        <p className="mt-1 text-xs text-muted-foreground">
                                          {task.notes}
                                        </p>
                                      )}
                                      <div className="mt-2 flex items-center gap-2">
                                        <Badge
                                          variant="outline"
                                          className={cn(
                                            'border-transparent',
                                            task.completed
                                              ? 'bg-green-500/10 text-green-500'
                                              : 'bg-gray-500/10 text-gray-500',
                                          )}
                                        >
                                          {task.completed ? 'Completed' : 'To Do'}
                                        </Badge>
                                      </div>
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => void open(task.permalink_url)}
                                    >
                                      <ExternalLink className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                              <p>No tasks found for this project.</p>
                            </div>
                          )
                        ) : (
                          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                            <p>Select a project to load its tasks.</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </TabsContent>
              )}
            </Tabs>
          )}
        </ScrollArea>
      </main>
    </div>
  );
}
