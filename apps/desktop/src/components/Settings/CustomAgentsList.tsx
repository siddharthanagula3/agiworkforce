/**
 * CustomAgentsList
 *
 * Card grid listing all custom agents with an inline editor.
 * Fetches from Rust backend on mount.
 */

import { Bot, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { type CustomAgentConfig, useCustomAgentsStore } from '../../stores/customAgentsStore';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/AlertDialog';
import { CustomAgentEditor } from './CustomAgentEditor';

// ---- Sub-components ----------------------------------------------------------

interface AgentCardProps {
  agent: CustomAgentConfig;
  onClick: () => void;
  onEdit?: (agent: CustomAgentConfig) => void;
  onDelete?: (name: string, scope: string) => void;
}

function AgentCard({ agent, onClick, onEdit, onDelete }: AgentCardProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <div className="group relative w-full text-left rounded-lg border border-border bg-card p-4 hover:bg-accent/50 transition-colors">
        {/* Hover action buttons */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 absolute top-2 right-2">
          <button
            type="button"
            aria-label="Edit agent"
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.(agent);
            }}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            aria-label="Delete agent"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteOpen(true);
            }}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Clickable card body */}
        <button
          type="button"
          onClick={onClick}
          className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-sm font-medium truncate">{agent.name}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 pr-14">
              {agent.model && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {agent.model}
                </Badge>
              )}
              <Badge
                variant={agent.scope === 'global' ? 'default' : 'outline'}
                className="text-[10px] px-1.5 py-0"
              >
                {agent.scope}
              </Badge>
            </div>
          </div>

          {agent.description ? (
            <p className="text-xs text-muted-foreground line-clamp-2">{agent.description}</p>
          ) : (
            <p className="text-xs text-muted-foreground/50 italic">No description</p>
          )}

          {agent.allowedTools && agent.allowedTools.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {agent.allowedTools.slice(0, 4).map((tool) => (
                <span
                  key={tool}
                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  {tool}
                </span>
              ))}
              {agent.allowedTools.length > 4 && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  +{agent.allowedTools.length - 4} more
                </span>
              )}
            </div>
          )}
        </button>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={(open) => !open && setDeleteOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete agent?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                onDelete?.(agent.name, agent.scope);
                setDeleteOpen(false);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 p-12 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Bot className="h-7 w-7 text-muted-foreground" />
      </div>
      <h4 className="font-medium mb-1">No custom agents yet</h4>
      <p className="text-sm text-muted-foreground max-w-xs mb-4">
        Create a named agent with a custom model, system prompt, and tool restrictions. Agents are
        saved as <code className="rounded bg-muted px-1 py-0.5 text-xs">.md</code> files in your{' '}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">.claude/agents/</code> directory.
      </p>
      <Button onClick={onCreate} size="sm">
        <Plus className="h-4 w-4 mr-1" />
        Create Your First Agent
      </Button>
    </div>
  );
}

// ---- Main Component ----------------------------------------------------------

type EditorMode =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; agent: CustomAgentConfig };

export function CustomAgentsList() {
  const { agents, isLoading, error, fetchAgents, deleteAgent } = useCustomAgentsStore(
    useShallow((s) => ({
      agents: s.agents,
      isLoading: s.isLoading,
      error: s.error,
      fetchAgents: s.fetchAgents,
      deleteAgent: s.deleteAgent,
    })),
  );
  const [editorMode, setEditorMode] = useState<EditorMode>({ kind: 'closed' });

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  const handleCreate = useCallback(() => {
    setEditorMode({ kind: 'create' });
  }, []);

  const handleEdit = useCallback((agent: CustomAgentConfig) => {
    setEditorMode({ kind: 'edit', agent });
  }, []);

  const handleEditorClose = useCallback(() => {
    setEditorMode({ kind: 'closed' });
  }, []);

  const handleDelete = useCallback(
    (name: string, scope: string) => {
      void deleteAgent(name, scope);
    },
    [deleteAgent],
  );

  if (editorMode.kind !== 'closed') {
    return (
      <CustomAgentEditor
        initialAgent={editorMode.kind === 'edit' ? editorMode.agent : undefined}
        onClose={handleEditorClose}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Custom Agents</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {agents.length === 0
              ? 'No agents configured'
              : `${agents.length} agent${agents.length === 1 ? '' : 's'} configured`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void fetchAgents()}
            disabled={isLoading}
            aria-label="Refresh agents"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={isLoading}>
            <Plus className="h-4 w-4 mr-1" />
            Create Agent
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Content */}
      {isLoading && agents.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1].map((i) => (
            <div key={i} className="h-24 rounded-lg border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <EmptyState onCreate={handleCreate} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {agents.map((agent) => (
            <AgentCard
              key={`${agent.scope}:${agent.name}`}
              agent={agent}
              onClick={() => handleEdit(agent)}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Path hints */}
      <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground space-y-1">
        <p>
          <strong>Global agents:</strong>{' '}
          <code className="rounded bg-muted px-1 py-0.5">~/.claude/agents/</code>
        </p>
        <p>
          <strong>Project agents:</strong>{' '}
          <code className="rounded bg-muted px-1 py-0.5">.claude/agents/</code> (relative to working
          directory)
        </p>
        <p>Agent files are Markdown with YAML frontmatter and can be edited manually.</p>
      </div>
    </div>
  );
}

export default CustomAgentsList;
