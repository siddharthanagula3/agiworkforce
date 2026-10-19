'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, NotebookPen } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Spinner } from '@agiworkforce/ui';
import { toUserMessage } from '@/lib/user-error-message';
import {
  listProjectKnowledgeFiles,
  uploadProjectKnowledgeFile,
} from '../services/project-knowledge-upload';

export const PROJECT_NOTES_FILE_NAME = 'Notes.md';

const NotesEditor = dynamic(
  () =>
    import('@features/chat/components/artifacts/ArtifactDocumentEditor').then(
      (module) => module.ArtifactDocumentEditor,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex justify-center p-4">
        <Spinner size="sm" aria-label="Opening the notes" />
      </div>
    ),
  },
);

const NO_WRAPS = {};

type NotesState = { status: 'loading' } | { status: 'ready'; saved: string } | { status: 'failed' };

async function readNotes(projectId: string): Promise<string> {
  const files = await listProjectKnowledgeFiles(projectId);
  const notes = files.find((file) => file.fileName === PROJECT_NOTES_FILE_NAME);
  if (!notes) return '';
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/knowledge-files/${encodeURIComponent(notes.id)}`,
    { credentials: 'include' },
  );
  if (!response.ok) throw new Error('Your notes could not be loaded');
  return response.text();
}

export function ProjectNotes({
  projectId,
  readOnly,
  onSaved,
}: {
  projectId: string;
  readOnly: boolean;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<NotesState>({ status: 'loading' });
  const [draft, setDraft] = useState('');
  const [editorKey, setEditorKey] = useState(0);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const text = await readNotes(projectId);
      setState({ status: 'ready', saved: text });
      setDraft(text);
      setEditorKey((key) => key + 1);
    } catch {
      setState({ status: 'failed' });
    }
  }, [projectId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await uploadProjectKnowledgeFile({
        projectId,
        file: new File([draft], PROJECT_NOTES_FILE_NAME, { type: 'text/markdown' }),
      });
      setState({ status: 'ready', saved: draft });
      toast.success('Notes saved. The assistant uses them as a source in this project.');
      onSaved?.();
    } catch (error) {
      toast.error(toUserMessage(error, 'Your notes were not saved'));
    } finally {
      setSaving(false);
    }
  };

  const dirty = state.status === 'ready' && draft !== state.saved;

  return (
    <section
      className="mb-4 rounded-xl border border-[var(--chat-border)]"
      aria-label="Notes"
      data-testid="project-notes"
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2 px-3 text-start text-sm font-medium text-foreground"
        data-testid="project-notes-toggle"
      >
        <NotebookPen className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="flex-1">Notes</span>
        <span className="text-xs font-normal text-muted-foreground">
          Kept beside your sources and used as one
        </span>
        <ChevronRight
          className={`h-4 w-4 text-muted-foreground transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div className="border-t border-[var(--chat-border)]">
          {state.status === 'loading' ? (
            <div className="flex justify-center p-4">
              <Spinner size="sm" aria-label="Loading your notes" />
            </div>
          ) : state.status === 'failed' ? (
            <div
              className="flex items-center gap-2 p-3 text-sm text-muted-foreground"
              role="status"
            >
              Your notes could not be loaded.
              <button type="button" onClick={() => void load()} className="underline">
                Try again
              </button>
            </div>
          ) : readOnly ? (
            <pre className="whitespace-pre-wrap p-3 text-sm text-foreground">
              {state.saved || 'No notes yet.'}
            </pre>
          ) : (
            <>
              <div className="h-72">
                <NotesEditor key={editorKey} value={draft} onChange={setDraft} wraps={NO_WRAPS} />
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-[var(--chat-border)] px-3 py-2">
                {dirty ? (
                  <span className="text-xs text-muted-foreground">Unsaved changes</span>
                ) : null}
                <Button
                  size="sm"
                  onClick={() => void save()}
                  disabled={!dirty || saving}
                  data-testid="project-notes-save"
                >
                  {saving ? 'Saving…' : 'Save notes'}
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
