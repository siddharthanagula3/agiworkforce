import { useState, useEffect, useCallback } from 'react';
import { Terminal } from './Terminal';
import { useTerminalStore, type ShellTypeLiteral } from '../../stores/terminalStore';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import {
  Plus,
  X,
  Terminal as TerminalIcon,
  ChevronDown,
  History,
  RotateCcw,
  Play,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/DropdownMenu';
import { ScrollArea } from '../ui/ScrollArea';
import { Spinner } from '../ui/Spinner';

interface TerminalWorkspaceProps {
  className?: string;
}

export function TerminalWorkspace({ className }: TerminalWorkspaceProps) {
  const {
    sessions,
    activeSessionId,
    availableShells,
    loadAvailableShells,
    createSession,
    closeSession,
    setActiveSession,
    getHistory,
    sendInput,
  } = useTerminalStore();

  const [isCreating, setIsCreating] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<string[]>([]);
  const [initialSessionSpawned, setInitialSessionSpawned] = useState(false);

  useEffect(() => {
    // Load available shells on mount
    loadAvailableShells().catch((error) => {
      console.error('Failed to load shells:', error);
      toast.error('Failed to detect available shells');
    });
  }, [loadAvailableShells]);

  const handleCreateSession = useCallback(
    async (shellType: ShellTypeLiteral) => {
      if (isCreating) return false;

      setIsCreating(true);
      try {
        await createSession(shellType);
        toast.success(`Created ${shellType} session`);
        return true;
      } catch (error) {
        console.error('Failed to create terminal session:', error);
        toast.error(`Failed to create ${shellType} session`);
        return false;
      } finally {
        setIsCreating(false);
      }
    },
    [createSession, isCreating],
  );

  const handleCloseSession = async (sessionId: string, event: React.MouseEvent) => {
    event.stopPropagation();

    try {
      await closeSession(sessionId);
      if (sessionId === activeSessionId) {
        setHistoryEntries([]);
      }
      toast.info('Terminal session closed');
    } catch (error) {
      console.error('Failed to close session:', error);
      toast.error('Failed to close terminal session');
    }
  };

  const refreshHistory = useCallback(
    async (sessionId: string) => {
      setIsHistoryLoading(true);
      try {
        const history = await getHistory(sessionId, 100);
        setHistoryEntries(history);
      } catch (error) {
        console.error('Failed to load terminal history:', error);
        toast.error('Failed to load terminal history');
      } finally {
        setIsHistoryLoading(false);
      }
    },
    [getHistory],
  );

  useEffect(() => {
    if (isHistoryOpen && activeSessionId) {
      void refreshHistory(activeSessionId);
    } else if (!isHistoryOpen) {
      setHistoryEntries([]);
    }
  }, [isHistoryOpen, activeSessionId, refreshHistory]);

  useEffect(() => {
    if (!activeSessionId) {
      setHistoryEntries([]);
    }
  }, [activeSessionId]);

  useEffect(() => {
    if (initialSessionSpawned || sessions.length > 0) {
      if (sessions.length > 0 && !initialSessionSpawned) {
        setInitialSessionSpawned(true);
      }
      return;
    }

    const preferredShell =
      availableShells.find((shell) => shell.available && shell.shell_type === 'PowerShell') ??
      availableShells.find((shell) => shell.available);

    if (!preferredShell || isCreating) {
      return;
    }

    let cancelled = false;
    (async () => {
      const success = await handleCreateSession(preferredShell.shell_type);
      if (cancelled) return;

      if (success) {
        setInitialSessionSpawned(true);
      } else {
        setInitialSessionSpawned(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [availableShells, handleCreateSession, initialSessionSpawned, isCreating, sessions.length]);

  const handleToggleHistory = () => {
    if (!activeSessionId) {
      toast.error('Open a terminal session to view history');
      return;
    }

    setIsHistoryOpen((prev) => !prev);
  };

  const handleReplayCommand = async (command: string) => {
    if (!activeSessionId) {
      toast.error('No active terminal session');
      return;
    }

    const trimmed = command.trim();
    if (!trimmed) {
      return;
    }

    try {
      await sendInput(activeSessionId, `${trimmed}\n`);
      toast.success(`Re-ran: ${trimmed}`);
    } catch (error) {
      console.error('Failed to replay command:', error);
      toast.error('Failed to replay command');
    }
  };

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  return (
    <div className={cn('flex flex-col h-full bg-background min-h-0 min-w-0', className)}>
      {/* Top Toolbar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/10">
        <div className="flex items-center gap-2">
          <TerminalIcon className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Terminal</span>
          {sessions.length > 0 && (
            <span className="text-xs text-muted-foreground">
              ({sessions.length} session{sessions.length !== 1 ? 's' : ''})
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={isHistoryOpen ? 'default' : 'ghost'}
            size="sm"
            onClick={handleToggleHistory}
            disabled={!activeSession}
          >
            <History className="mr-1 h-4 w-4" />
            History
          </Button>
          {isHistoryOpen && activeSession && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void refreshHistory(activeSession.id)}
              disabled={isHistoryLoading}
            >
              {isHistoryLoading ? (
                <Spinner size="sm" className="mr-2" />
              ) : (
                <RotateCcw className="mr-2 h-4 w-4" />
              )}
              Refresh
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="default"
                size="sm"
                disabled={isCreating || availableShells.length === 0}
              >
                <Plus className="mr-1 h-4 w-4" />
                New Terminal
                <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {availableShells.length === 0 && (
                <DropdownMenuItem disabled>No shells available</DropdownMenuItem>
              )}
              {availableShells
                .filter((shell) => shell.available)
                .map((shell) => (
                  <DropdownMenuItem
                    key={shell.shell_type}
                    onClick={() => void handleCreateSession(shell.shell_type)}
                  >
                    <TerminalIcon className="mr-2 h-4 w-4" />
                    {shell.name}
                  </DropdownMenuItem>
                ))}
              {availableShells.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                    {availableShells.filter((s) => s.available).length} shell
                    {availableShells.filter((s) => s.available).length !== 1 ? 's' : ''} available
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Tab Bar */}
      {sessions.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-muted/5 px-2 py-1">
          {sessions.map((session) => {
            const isActive = session.id === activeSessionId;

            return (
              <div
                key={session.id}
                onClick={() => setActiveSession(session.id)}
                className={cn(
                  'group flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 transition-colors',
                  isActive ? 'border border-border bg-background shadow-sm' : 'hover:bg-muted/50',
                )}
              >
                <TerminalIcon className="h-3 w-3 text-muted-foreground" />
                <span className={cn('text-sm font-mono', isActive && 'font-medium')}>
                  {session.title}
                </span>

                <button
                  onClick={(e) => handleCloseSession(session.id, e)}
                  className={cn(
                    'text-muted-foreground transition-colors hover:text-foreground',
                    'opacity-0 group-hover:opacity-100',
                    isActive && 'opacity-100',
                  )}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Terminal Content */}
      <div className="relative flex-1 overflow-hidden">
        {activeSession ? (
          <div className="flex h-full">
            <Terminal
              key={activeSession.id}
              sessionId={activeSession.id}
              className={cn('h-full flex-1', isHistoryOpen ? 'pr-0' : 'w-full')}
            />
            {isHistoryOpen && (
              <aside className="flex w-80 flex-col border-l border-border bg-muted/10">
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">Command History</p>
                    <p className="text-xs text-muted-foreground">{activeSession.title}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {historyEntries.length} item{historyEntries.length === 1 ? '' : 's'}
                  </span>
                </div>
                <ScrollArea className="flex-1">
                  <div className="space-y-2 p-3">
                    {isHistoryLoading ? (
                      <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                        <Spinner size="sm" className="mr-2" />
                        Loading history...
                      </div>
                    ) : historyEntries.length === 0 ? (
                      <div className="py-4 text-center text-xs text-muted-foreground">
                        No recorded commands yet.
                      </div>
                    ) : (
                      historyEntries.map((command, index) => (
                        <div
                          key={`${command}-${index}`}
                          className="group rounded-md border border-border/60 bg-background px-3 py-2 text-xs font-mono"
                        >
                          <p className="whitespace-pre-wrap break-words">{command}</p>
                          <div className="mt-2 flex items-center justify-end opacity-0 transition-opacity group-hover:opacity-100">
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => handleReplayCommand(command)}
                            >
                              <Play className="mr-1 h-3 w-3" />
                              Run
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </aside>
            )}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
            <div className="space-y-4 text-center">
              <div className="text-6xl opacity-20">
                <TerminalIcon className="inline-block" />
              </div>
              <div>
                <p className="mb-2 text-lg font-medium">No Terminal Sessions</p>
                <p className="mb-4 text-sm">Create a new terminal session to get started</p>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" disabled={availableShells.length === 0}>
                    <Plus className="mr-2 h-4 w-4" />
                    New Terminal
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center">
                  {availableShells.length === 0 && (
                    <DropdownMenuItem disabled>No shells available</DropdownMenuItem>
                  )}
                  {availableShells
                    .filter((shell) => shell.available)
                    .map((shell) => (
                      <DropdownMenuItem
                        key={shell.shell_type}
                        onClick={() => void handleCreateSession(shell.shell_type)}
                      >
                        <TerminalIcon className="mr-2 h-4 w-4" />
                        {shell.name}
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}
      </div>

      {/* Status Bar */}
      {activeSession && (
        <div className="flex items-center justify-between border-t border-border bg-muted/10 px-3 py-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>Shell: {activeSession.shellType}</span>
            {activeSession.cwd && <span>CWD: {activeSession.cwd}</span>}
          </div>
          <div className="flex items-center gap-3">
            <span>Session: {activeSession.id.slice(0, 8)}</span>
            {isHistoryOpen && <span className="text-muted-foreground/80">History visible</span>}
          </div>
        </div>
      )}
    </div>
  );
}
