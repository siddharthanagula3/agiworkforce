'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button, Spinner, useConfirmAction } from '@agiworkforce/ui';
import { AGENT_FILES_MAX, type AgentFile } from '@agiworkforce/cloud-contracts';

import { toUserMessage } from '@/lib/user-error-message';
import type { AgentsApi } from '../services/agents-client';

const FILE_ACCEPT =
  '.txt,.md,.markdown,.csv,.tsv,.json,.jsonl,.yaml,.yml,.xml,.html,.pdf,.docx,.xlsx,.pptx,text/*';

function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 100) / 10} KB`;
  return `${Math.round(bytes / 100_000) / 10} MB`;
}

export function AgentKnowledgePanel({
  api,
  agentId,
  editable,
}: {
  api: AgentsApi;
  agentId: string;
  editable: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<AgentFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const { confirm, dialog } = useConfirmAction();

  const load = useCallback(() => {
    setError(null);
    api
      .files(agentId)
      .then(setFiles)
      .catch((reason: unknown) =>
        setError(toUserMessage(reason, 'The agent’s files could not be loaded.')),
      );
  }, [api, agentId]);

  useEffect(load, [load]);

  const upload = async (picked: FileList | null) => {
    if (!picked || picked.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(picked)) {
        const saved = await api.addFile(agentId, file);
        setFiles((current) =>
          [...(current ?? []), saved].sort((a, b) => a.name.localeCompare(b.name)),
        );
      }
    } catch (reason) {
      toast.error(toUserMessage(reason, 'The file could not be added.'));
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  };

  const remove = (file: AgentFile) =>
    confirm({
      title: `Remove ${file.name}?`,
      description:
        'The agent stops reading this file in every chat, including chats already open. The file is deleted from the agent and cannot be recovered here; keep your own copy if you need it.',
      confirmLabel: 'Remove file',
      destructive: true,
      onConfirm: async () => {
        try {
          await api.removeFile(agentId, file.id);
          setFiles((current) => (current ?? []).filter((entry) => entry.id !== file.id));
        } catch (reason) {
          toast.error(toUserMessage(reason, 'The file could not be removed.'));
        }
      },
    });

  const full = (files?.length ?? 0) >= AGENT_FILES_MAX;

  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      {dialog}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${id}-heading`} className="text-sm font-medium text-foreground">
            Knowledge
          </h2>
          <p className="text-xs text-muted-foreground">
            Files the agent reads in every chat, up to {AGENT_FILES_MAX}. Text, PDF, Word, Excel and
            PowerPoint files are stored as their text.
          </p>
        </div>
        {editable ? (
          <>
            <input
              ref={input}
              type="file"
              multiple
              accept={FILE_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => void upload(event.target.files)}
            />
            <Button
              variant="outline"
              size="sm"
              className="pointer-coarse:min-h-11"
              disabled={uploading || full}
              aria-busy={uploading}
              onClick={() => input.current?.click()}
            >
              {uploading ? <Spinner size="sm" className="me-2" aria-hidden="true" /> : null}
              Add files
            </Button>
          </>
        ) : null}
      </div>
      {error ? (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
          <Button variant="outline" size="sm" onClick={load}>
            Try again
          </Button>
        </div>
      ) : files === null ? (
        <div className="flex items-center gap-2">
          <Spinner size="sm" />
          <span className="text-sm text-muted-foreground">Loading files…</span>
        </div>
      ) : files.length === 0 ? (
        <p className="text-sm text-muted-foreground">No files yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {files.map((file) => (
            <li key={file.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(file.byteSize)} of text
                </p>
              </div>
              {editable ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="pointer-coarse:min-h-11"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => remove(file)}
                >
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
