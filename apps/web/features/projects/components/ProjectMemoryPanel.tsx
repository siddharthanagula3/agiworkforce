'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Input, useConfirmAction } from '@agiworkforce/ui';
import { useMemoryStore } from '@agiworkforce/unified-chat';
import { toUserMessage } from '@/lib/user-error-message';

const ADD_FAILED_MESSAGE = 'Could not save this memory. Try again.';
const DELETE_FAILED_MESSAGE = 'Could not delete this memory. Try again.';

interface ProjectMemoryPanelProps {
  projectId: string;
  projectName: string;
}

export function ProjectMemoryPanel({ projectId, projectName }: ProjectMemoryPanelProps) {
  const facts = useMemoryStore((s) => s.facts);
  const add = useMemoryStore((s) => s.add);
  const remove = useMemoryStore((s) => s.remove);
  const hydrate = useMemoryStore((s) => s.hydrateFromServer);
  const { confirm, dialog } = useConfirmAction();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const projectFacts = facts.filter((fact) => fact.projectId === projectId);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    setError(null);
    try {
      await add(text, undefined, { id: projectId, name: projectName });
    } catch (caught) {
      setDraft(text);
      setError(toUserMessage(caught, ADD_FAILED_MESSAGE));
    }
  };

  return (
    <div className="space-y-2">
      {dialog}
      {projectFacts.length > 0 ? (
        <ul aria-label="Project memories" className="space-y-1">
          {projectFacts.map((fact) => (
            <li
              key={fact.id}
              className="flex items-start justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-foreground"
            >
              <span>{fact.text}</span>
              <button
                type="button"
                aria-label={`Delete project memory: ${fact.text}`}
                disabled={fact.pending}
                onClick={() =>
                  confirm({
                    title: 'Delete this project memory?',
                    description:
                      'Chats in this project stop using it. It cannot be restored and would have to be added again.',
                    confirmLabel: 'Delete memory',
                    onConfirm: async () => {
                      setError(null);
                      try {
                        await remove(fact.id);
                      } catch (caught) {
                        setError(toUserMessage(caught, DELETE_FAILED_MESSAGE));
                      }
                    },
                  })
                }
                className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-destructive-text disabled:opacity-50"
              >
                <Trash2 size={13} strokeWidth={1.75} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-caption text-muted-foreground">
          No memories that only this project uses yet.
        </p>
      )}
      <form onSubmit={(event) => void onSubmit(event)} className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label="Add a memory only this project uses"
          placeholder="e.g. This project targets the EU market."
          className="h-8 rounded-xl bg-muted/40 text-xs"
        />
        <Button type="submit" size="sm" variant="outline" disabled={!draft.trim()}>
          Add
        </Button>
      </form>
      {error ? (
        <p role="alert" className="text-caption text-destructive-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
