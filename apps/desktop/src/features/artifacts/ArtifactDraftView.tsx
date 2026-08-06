/**
 * ArtifactDraftView
 *
 * Progressive, DISPLAY-ONLY view of a `create_artifact` tool call whose
 * arguments are still streaming (see `runtime/partialArtifactArgs.ts` and the
 * `chat:artifact-progress` event in
 * `src-tauri/src/sys/commands/chat/stream_runtime.rs`).
 *
 * It deliberately shows the source text as it arrives rather than rendering a
 * half-parsed preview: a partially written HTML/React/Mermaid document does not
 * render into anything truthful. The real renderer takes over the moment the
 * durable artifact lands on `chat:artifact` and the draft is dropped.
 *
 * Nothing here writes to the artifact store's backend paths — no create, no
 * append, no version.
 */

import { useEffect, useRef } from 'react';
import { Loader2, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { ArtifactDraft } from '@/stores/artifactStore';

interface ArtifactDraftViewProps {
  draft: ArtifactDraft;
  onClose?: () => void;
}

export function ArtifactDraftView({ draft, onClose }: ArtifactDraftViewProps) {
  const scrollRef = useRef<HTMLPreElement | null>(null);

  // Follow the stream as content arrives.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [draft.content]);

  const typeLabel = draft.artifactType ?? 'artifact';

  return (
    <div
      data-testid="artifact-draft-view"
      className="flex h-full flex-col bg-white dark:bg-zinc-900"
    >
      <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <Loader2
          className="h-4 w-4 animate-spin text-blue-500"
          aria-hidden="true"
          data-testid="artifact-draft-spinner"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {draft.title ?? 'Untitled artifact'}
          </div>
          <div className="text-xs text-zinc-500">Writing…</div>
        </div>
        <Badge variant="secondary" className="shrink-0 text-[10px] uppercase">
          {typeLabel}
        </Badge>
        {onClose ? (
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close artifact panel">
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      {draft.content.length > 0 ? (
        <pre
          ref={scrollRef}
          data-testid="artifact-draft-content"
          className="flex-1 overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs text-zinc-700 dark:text-zinc-300"
        >
          {draft.content}
        </pre>
      ) : (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-zinc-500">
          Preparing {typeLabel}…
        </div>
      )}
    </div>
  );
}
