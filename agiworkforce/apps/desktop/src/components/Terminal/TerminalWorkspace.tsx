import { useState, useEffect } from 'react';
import { Terminal } from './Terminal';
import { useTerminalStore } from '../../stores/terminalStore';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import {
  Plus,
  X,
  Terminal as TerminalIcon,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/DropdownMenu';

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
  } = useTerminalStore();

  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    // Load available shells on mount
    loadAvailableShells().catch((error) => {
      console.error('Failed to load shells:', error);
      toast.error('Failed to detect available shells');
    });
  }, []);

  const handleCreateSession = async (shellType: string) => {
    if (isCreating) return;

    setIsCreating(true);
    try {
      await createSession(shellType);
      toast.success(`Created ${shellType} session`);
    } catch (error) {
      console.error('Failed to create terminal session:', error);
      toast.error(`Failed to create ${shellType} session`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCloseSession = async (sessionId: string, event: React.MouseEvent) => {
    event.stopPropagation();

    try {
      await closeSession(sessionId);
      toast.info('Terminal session closed');
    } catch (error) {
      console.error('Failed to close session:', error);
      toast.error('Failed to close terminal session');
    }
  };

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  return (
    <div className={cn('flex flex-col h-full bg-background', className)}>
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

        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="default"
                size="sm"
                disabled={isCreating || availableShells.length === 0}
              >
                <Plus className="h-4 w-4 mr-1" />
                New Terminal
                <ChevronDown className="h-3 w-3 ml-1" />
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
                    onClick={() => handleCreateSession(shell.shell_type)}
                  >
                    <TerminalIcon className="h-4 w-4 mr-2" />
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
        <div className="flex items-center gap-1 px-2 py-1 border-b border-border bg-muted/5 overflow-x-auto">
          {sessions.map((session) => {
            const isActive = session.id === activeSessionId;

            return (
              <div
                key={session.id}
                onClick={() => setActiveSession(session.id)}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer',
                  'transition-colors group whitespace-nowrap',
                  isActive
                    ? 'bg-background border border-border shadow-sm'
                    : 'hover:bg-muted/50'
                )}
              >
                <TerminalIcon className="h-3 w-3 text-muted-foreground" />
                <span className={cn('text-sm font-mono', isActive && 'font-medium')}>
                  {session.title}
                </span>

                <button
                  onClick={(e) => handleCloseSession(session.id, e)}
                  className={cn(
                    'text-muted-foreground hover:text-foreground',
                    'transition-colors opacity-0 group-hover:opacity-100',
                    isActive && 'opacity-100'
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
      <div className="flex-1 overflow-hidden relative">
        {activeSession ? (
          <Terminal key={activeSession.id} sessionId={activeSession.id} className="h-full" />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <div className="text-center space-y-4">
              <div className="text-6xl opacity-20">
                <TerminalIcon className="inline-block" />
              </div>
              <div>
                <p className="text-lg font-medium mb-2">No Terminal Sessions</p>
                <p className="text-sm mb-4">
                  Create a new terminal session to get started
                </p>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" disabled={availableShells.length === 0}>
                    <Plus className="h-4 w-4 mr-2" />
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
                        onClick={() => handleCreateSession(shell.shell_type)}
                      >
                        <TerminalIcon className="h-4 w-4 mr-2" />
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
        <div className="flex items-center justify-between px-3 py-1 text-xs text-muted-foreground bg-muted/10 border-t border-border">
          <div className="flex items-center gap-3">
            <span>Shell: {activeSession.shellType}</span>
            {activeSession.cwd && <span>CWD: {activeSession.cwd}</span>}
          </div>
          <div className="flex items-center gap-3">
            <span>Session: {activeSession.id.slice(0, 8)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
