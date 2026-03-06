/**
 * InlineArtifactEditor
 *
 * An inline editor for artifact content. Renders a monospace textarea for code
 * artifacts and a regular textarea for document / other types. On save it
 * computes a line-level diff and calls `onSave`; on cancel it calls `onCancel`.
 */

import { useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import { computeLineDiff, type ArtifactDiff } from '@/lib/diffUtils';
import { Button } from '@/components/ui/Button';
import type { Artifact } from '@/stores/artifactStore';

interface InlineArtifactEditorProps {
  artifact: Artifact;
  onSave: (diff: ArtifactDiff) => void;
  onCancel: () => void;
}

export function InlineArtifactEditor({ artifact, onSave, onCancel }: InlineArtifactEditorProps) {
  const [editedContent, setEditedContent] = useState(artifact.content);

  const isCode = artifact.artifact_type === 'code' || artifact.artifact_type === 'web';

  const handleSave = useCallback(() => {
    const diff = computeLineDiff(artifact.content, editedContent);
    onSave(diff);
  }, [artifact.content, editedContent, onSave]);

  const hasChanges = editedContent !== artifact.content;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 truncate">
          {artifact.title}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={onCancel} className="h-7 px-2 text-xs">
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges}
            className="h-7 px-3 text-xs"
          >
            Save
          </Button>
        </div>
      </div>

      {/* Editor area */}
      <div className="flex-1 min-h-0 p-2">
        <textarea
          value={editedContent}
          onChange={(e) => setEditedContent(e.target.value)}
          spellCheck={!isCode}
          className={cn(
            'w-full h-full min-h-[200px] resize-none rounded-md border border-zinc-200 dark:border-zinc-700',
            'bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100',
            'p-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50',
            isCode && 'font-mono text-xs leading-relaxed',
          )}
          placeholder={isCode ? 'Edit code...' : 'Edit content...'}
        />
      </div>

      {/* Footer hint */}
      {hasChanges && (
        <div className="px-3 py-1.5 text-xs text-zinc-500 dark:text-zinc-400 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30">
          Unsaved changes — click Save to apply diff
        </div>
      )}
    </div>
  );
}

export default InlineArtifactEditor;
