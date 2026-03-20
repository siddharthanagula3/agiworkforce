/**
 * ArtifactList
 *
 * Sidebar list of all canvas artifacts in the current session.
 * - Type icon + title + language + relative timestamp
 * - Click to open in CanvasPanel
 * - Delete button per item
 * - "New" button to create a blank artifact
 */

import { Code2, FileText, Globe, Plus, Trash2 } from 'lucide-react';
import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '../../lib/utils';
import {
  useCanvasStore,
  type CanvasArtifact,
  type CanvasArtifactType,
} from '../../stores/canvasStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function TypeIcon({ type }: { type: CanvasArtifactType }) {
  switch (type) {
    case 'html':
      return <Globe className="h-4 w-4 text-orange-400" />;
    case 'markdown':
      return <FileText className="h-4 w-4 text-blue-400" />;
    case 'document':
      return <FileText className="h-4 w-4 text-purple-400" />;
    default:
      return <Code2 className="h-4 w-4 text-green-400" />;
  }
}

function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function executionBadge(state: CanvasArtifact['executionState']): React.ReactNode | null {
  if (state === 'success')
    return <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />;
  if (state === 'error') return <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />;
  if (state === 'running')
    return <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 shrink-0 animate-pulse" />;
  return null;
}

// ---------------------------------------------------------------------------
// ArtifactList
// ---------------------------------------------------------------------------

interface ArtifactListProps {
  className?: string;
}

export function ArtifactList({ className }: ArtifactListProps) {
  const { artifacts, activeArtifactId, deleteArtifact, openPanel, createArtifact } = useCanvasStore(
    useShallow((s) => ({
      artifacts: s.artifacts,
      activeArtifactId: s.activeArtifactId,
      deleteArtifact: s.deleteArtifact,
      openPanel: s.openPanel,
      createArtifact: s.createArtifact,
    })),
  );

  const handleSelect = useCallback(
    (id: string) => {
      openPanel(id);
    },
    [openPanel],
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      deleteArtifact(id);
    },
    [deleteArtifact],
  );

  const handleCreateNew = useCallback(() => {
    const id = createArtifact('code', '', 'python', 'New Script');
    openPanel(id);
  }, [createArtifact, openPanel]);

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Canvas ({artifacts.length})
        </h3>
        <button
          type="button"
          onClick={handleCreateNew}
          className="flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300 transition-colors"
          title="Create new artifact"
        >
          <Plus className="h-3.5 w-3.5" />
          New
        </button>
      </div>

      {/* List */}
      {artifacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 px-4 py-8 text-center">
          <Code2 className="h-8 w-8 text-gray-600" />
          <p className="text-xs text-gray-500">
            No artifacts yet. Ask the AI to write code, or click New.
          </p>
          <button
            type="button"
            onClick={handleCreateNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-teal-500/20 text-teal-400 hover:bg-teal-500/30 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Create artifact
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto py-1">
          {artifacts.map((artifact) => (
            <button
              key={artifact.id}
              type="button"
              onClick={() => handleSelect(artifact.id)}
              className={cn(
                'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors group',
                activeArtifactId === artifact.id
                  ? 'bg-white/5 border-l-2 border-teal-500'
                  : 'hover:bg-white/5 border-l-2 border-transparent',
              )}
            >
              <div className="mt-0.5 shrink-0">
                <TypeIcon type={artifact.type} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-gray-200 truncate font-medium">
                    {artifact.title}
                  </span>
                  {executionBadge(artifact.executionState)}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {artifact.language && (
                    <span className="text-xs text-gray-500 font-mono">{artifact.language}</span>
                  )}
                  <span className="text-xs text-gray-600">{relativeTime(artifact.createdAt)}</span>
                </div>
              </div>

              {/* Delete button — visible on hover */}
              <button
                type="button"
                onClick={(e) => handleDelete(e, artifact.id)}
                className="shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                title="Delete artifact"
                aria-label={`Delete ${artifact.title}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
