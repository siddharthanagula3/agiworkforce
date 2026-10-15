import { useEffect, useId, useState } from 'react';
import { useConfirmAction } from '@agiworkforce/ui';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Input';
import { Label } from '@/ui/Label';
import { Spinner } from '@/ui/Spinner';
import { formatFolderPath } from '../../stores/projectStore';
import { useProjectMemoryStore, type ProjectMemory } from '../../stores/projectMemoryStore';

export const PROJECT_MEMORY_MAX_CHARS = 1000;

interface ProjectMemoryText {
  title: string;
  detail: string | null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function list(value: unknown): string {
  return Array.isArray(value) ? value.map(text).filter(Boolean).join(', ') : '';
}

export function describeProjectMemory(memory: ProjectMemory): ProjectMemoryText {
  let stored: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(memory.content);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { title: memory.content, detail: null };
    }
    stored = parsed as Record<string, unknown>;
  } catch {
    return { title: memory.content, detail: null };
  }

  const decision = text(stored['decision']);
  if (decision) return { title: decision, detail: text(stored['rationale']) || null };

  const styleKey = text(stored['style_key']);
  if (styleKey) return { title: styleKey, detail: text(stored['style_value']) || null };

  const facts = [
    list(stored['tech_stack']),
    text(stored['main_language']),
    list(stored['frameworks']),
  ].filter(Boolean);
  const conventions = text(stored['conventions']);
  if (facts.length > 0 || conventions) {
    return {
      title: facts.join(' · ') || conventions,
      detail: facts.length > 0 ? conventions || null : null,
    };
  }
  return { title: memory.content, detail: null };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ProjectMemorySection({ projectFolder }: { projectFolder: string }) {
  const memoryInputId = useId();
  const reasonInputId = useId();
  const loadedFolder = useProjectMemoryStore((state) => state.projectFolder);
  const storedMemories = useProjectMemoryStore((state) => state.memories);
  const isLoading = useProjectMemoryStore((state) => state.isLoading);
  const loadError = useProjectMemoryStore((state) => state.error);
  const loadProjectMemories = useProjectMemoryStore((state) => state.loadProjectMemories);
  const addProjectMemory = useProjectMemoryStore((state) => state.addProjectMemory);
  const deleteProjectMemory = useProjectMemoryStore((state) => state.deleteProjectMemory);
  const { confirm, dialog } = useConfirmAction();
  const [decision, setDecision] = useState('');
  const [rationale, setRationale] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    void loadProjectMemories(projectFolder);
  }, [loadProjectMemories, projectFolder]);

  const folderLabel = formatFolderPath(projectFolder);
  const memories = loadedFolder === projectFolder ? storedMemories : [];
  const trimmedDecision = decision.trim();

  const save = async () => {
    if (!trimmedDecision || isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await addProjectMemory(projectFolder, trimmedDecision, rationale.trim());
      setDecision('');
      setRationale('');
    } catch (error) {
      setSaveError(errorText(error));
    } finally {
      setIsSaving(false);
    }
  };

  const requestDelete = (memory: ProjectMemory) => {
    const { title } = describeProjectMemory(memory);
    confirm({
      title: 'Delete this folder memory?',
      description: `“${title}” will be removed from this device. Chats in ${folderLabel} stop recalling it, and it cannot be recovered.`,
      confirmLabel: 'Delete memory',
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteProjectMemory(memory.id);
        } catch (error) {
          toast.error('Could not delete this memory', { description: errorText(error) });
        }
      },
    });
  };

  return (
    <section className="space-y-3" aria-labelledby="project-memory-heading">
      <div className="space-y-1">
        <Label id="project-memory-heading" className="text-foreground">
          Folder memory
        </Label>
        <p className="text-sm leading-6 text-muted-foreground">
          Chats that work in{' '}
          <span className="break-all text-foreground" title={projectFolder}>
            {folderLabel}
          </span>{' '}
          recall these while memories are turned on in Settings → Memory. They are saved on this
          device for this folder only.
        </p>
      </div>

      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="space-y-1">
          <Label htmlFor={memoryInputId} className="text-foreground">
            Remember for this folder
          </Label>
          <Input
            id={memoryInputId}
            value={decision}
            maxLength={PROJECT_MEMORY_MAX_CHARS}
            onChange={(event) => setDecision(event.target.value)}
            placeholder="Use pnpm, never npm"
            className="bg-muted border-border text-foreground"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={reasonInputId} className="text-foreground">
            Reason (optional)
          </Label>
          <Input
            id={reasonInputId}
            value={rationale}
            maxLength={PROJECT_MEMORY_MAX_CHARS}
            onChange={(event) => setRationale(event.target.value)}
            placeholder="The lockfile is pnpm-lock.yaml"
            className="bg-muted border-border text-foreground"
          />
        </div>
        <Button
          type="submit"
          variant="outline"
          disabled={!trimmedDecision || isSaving}
          className="border-border text-foreground hover:bg-accent"
        >
          {isSaving ? 'Saving…' : 'Add memory'}
        </Button>
        {saveError ? (
          <p role="alert" className="text-sm text-danger">
            Could not save this memory: {saveError}
          </p>
        ) : null}
      </form>

      {loadError ? (
        <div role="alert" className="flex items-center justify-between gap-3">
          <p className="text-sm text-danger">Could not load this folder’s memories: {loadError}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadProjectMemories(projectFolder)}
          >
            Try again
          </Button>
        </div>
      ) : isLoading && memories.length === 0 ? (
        <Spinner size="sm" className="text-muted-foreground" />
      ) : memories.length === 0 ? (
        <p className="text-sm text-muted-foreground">No memories for this folder yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {memories.map((memory) => {
            const { title, detail } = describeProjectMemory(memory);
            return (
              <li key={memory.id} className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm text-foreground [overflow-wrap:anywhere]">{title}</p>
                  {detail ? (
                    <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                      {detail}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete memory: ${title}`}
                  onClick={() => requestDelete(memory)}
                  className="shrink-0 text-muted-foreground hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {dialog}
    </section>
  );
}
