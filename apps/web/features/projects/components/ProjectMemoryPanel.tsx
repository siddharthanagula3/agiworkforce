'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Button, Input, useConfirmAction } from '@agiworkforce/ui';
import {
  useCloudMemory,
  useCloudMemoryAdapter,
  useMemoryView,
} from '@/features/memory/use-cloud-memory';
import type { CloudMemoryController } from '@/features/memory/cloud-memory-controller';
import { toUserMessage } from '@/lib/user-error-message';

const SAVE_FAILED_MESSAGE = 'Could not save this memory. Try again.';
const DELETE_FAILED_MESSAGE = 'Could not delete this memory. Try again.';

interface ProjectMemoryPanelProps {
  projectId: string;
  projectName: string;
}

export function ProjectMemoryPanel(props: ProjectMemoryPanelProps) {
  const controller = useCloudMemory();
  return controller ? (
    <OwnedProjectMemoryPanel
      key={`${controller.key}:${props.projectId}`}
      {...props}
      controller={controller}
    />
  ) : (
    <p role="status">Cloud memory is unavailable until your account and workspace are ready.</p>
  );
}

function OwnedProjectMemoryPanel({
  projectId,
  controller,
}: ProjectMemoryPanelProps & { controller: CloudMemoryController }) {
  const {
    facts,
    syncStatus,
    mutationBlocked,
    update,
    hydrateFromServer: hydrate,
  } = useCloudMemoryAdapter(controller);
  const capture = useMemoryView(controller);
  const { confirm, dialog } = useConfirmAction();
  const [draft, setDraft] = useState('');
  const draftRevision = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const editRevision = useRef(0);
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void hydrate().catch(() => undefined);
  }, [hydrate]);

  const projectFacts = facts.filter((fact) => fact.projectId === projectId);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingRef.current || mutationBlocked) return;
    const text = draft.trim();
    if (!text) return;
    const current = capture();
    if (!current()) return;
    const revision = draftRevision.current;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await controller.addProject(text, projectId, current);
      if (current() && draftRevision.current === revision) setDraft('');
    } catch (caught) {
      if (!current()) return;
      setError(toUserMessage(caught, SAVE_FAILED_MESSAGE));
    } finally {
      savingRef.current = false;
      if (current()) setSaving(false);
    }
  };

  const onBeginEdit = (id: string, text: string) => {
    editRevision.current += 1;
    setEditingId(id);
    setEditDraft(text);
    setError(null);
  };

  const onCancelEdit = () => {
    editRevision.current += 1;
    setEditingId(null);
    setEditDraft('');
  };

  const onSaveEdit = async (event: FormEvent<HTMLFormElement>, id: string, previous: string) => {
    event.preventDefault();
    if (savingRef.current || mutationBlocked) return;
    const text = editDraft.trim();
    if (!text) return;
    const current = capture();
    if (!current()) return;
    const revision = editRevision.current;
    if (text === previous.trim()) {
      onCancelEdit();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await update(id, text);
      if (current() && editRevision.current === revision) onCancelEdit();
    } catch (caught) {
      if (current()) setError(toUserMessage(caught, SAVE_FAILED_MESSAGE));
    } finally {
      savingRef.current = false;
      if (current()) setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      {dialog}
      {editingId !== null && !projectFacts.some((fact) => fact.id === editingId) ? (
        <div className="space-y-2">
          <p className="text-caption text-muted-foreground">
            The saved fact is no longer in the loaded list. Your unsaved edit is kept here.
          </p>
          <Input
            aria-label="Unsaved project memory edit"
            value={editDraft}
            onChange={(event) => {
              editRevision.current += 1;
              setEditDraft(event.target.value);
            }}
          />
          <Button type="button" onClick={onCancelEdit}>
            Discard edit
          </Button>
        </div>
      ) : null}
      {projectFacts.length > 0 ? (
        <ul aria-label="Project memories" className="space-y-1">
          {projectFacts.map((fact) =>
            editingId === fact.id ? (
              <li key={fact.id} className="rounded-lg bg-muted/40 px-3 py-2">
                <form
                  onSubmit={(event) => void onSaveEdit(event, fact.id, fact.text)}
                  className="flex items-center gap-2"
                >
                  <Input
                    value={editDraft}
                    onChange={(event) => {
                      editRevision.current += 1;
                      setEditDraft(event.target.value);
                    }}
                    aria-label={`Edit project memory: ${fact.text}`}
                    autoFocus
                    className="h-8 rounded-xl bg-background text-sm"
                  />
                  <Button type="button" size="sm" variant="ghost" onClick={onCancelEdit}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    disabled={!editDraft.trim() || saving || mutationBlocked}
                  >
                    Save
                  </Button>
                </form>
              </li>
            ) : (
              <li
                key={fact.id}
                className="flex items-start justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm text-foreground"
              >
                <span className="min-w-0 break-words">{fact.text}</span>
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Edit project memory: ${fact.text}`}
                    disabled={fact.pending}
                    onClick={() => onBeginEdit(fact.id, fact.text)}
                    className="rounded-md p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    <Pencil size={13} strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete project memory: ${fact.text}`}
                    disabled={fact.pending}
                    onClick={() => {
                      const current = capture();
                      if (!current()) return;
                      confirm({
                        title: 'Delete this project memory?',
                        description:
                          'Chats in this project stop using it. It cannot be restored and would have to be added again.',
                        confirmLabel: 'Delete memory',
                        onConfirm: async () => {
                          if (!current()) return;
                          setError(null);
                          try {
                            await controller.adapter(current).remove(fact.id);
                          } catch (caught) {
                            if (current()) setError(toUserMessage(caught, DELETE_FAILED_MESSAGE));
                          }
                        },
                      });
                    }}
                    className="rounded-md p-1 text-muted-foreground hover:text-destructive-text disabled:opacity-50"
                  >
                    <Trash2 size={13} strokeWidth={1.75} />
                  </button>
                </span>
              </li>
            ),
          )}
        </ul>
      ) : (
        <p className="text-caption text-muted-foreground">
          {syncStatus === 'synced'
            ? 'No memories that only this project uses yet.'
            : 'Project cloud memories are not loaded.'}
        </p>
      )}
      <form onSubmit={(event) => void onSubmit(event)} className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(event) => {
            draftRevision.current += 1;
            setDraft(event.target.value);
          }}
          aria-label="Add a memory only this project uses"
          placeholder="e.g. This project targets the EU market."
          className="h-8 rounded-xl bg-muted/40 text-xs"
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={!draft.trim() || saving || mutationBlocked}
        >
          Add
        </Button>
      </form>
      {mutationBlocked ? (
        <p role="status">Check your saved memories and reload before making another change.</p>
      ) : null}
      {syncStatus === 'error' ? (
        <>
          <p role="status">The loaded memory list may be out of date.</p>
          <button
            type="button"
            onClick={() => {
              if (capture()()) void hydrate().catch(() => undefined);
            }}
          >
            Reload memories
          </button>
        </>
      ) : null}
      {error ? (
        <p role="alert" className="text-caption text-destructive-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
