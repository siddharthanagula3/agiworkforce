'use client';

import { Code2, X, FileCode, PanelRightOpen, FolderDown } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { Button } from '@shared/ui/button';
import { useArtifactsStore, type Artifact } from '../../stores/artifacts-store';
import { ArtifactPreview } from './ArtifactPreview';

// ============================================================================
// Download All helper (Fix 41)
// ============================================================================

async function downloadAllArtifacts(artifacts: Artifact[]) {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  artifacts.forEach((artifact) => {
    const ext = artifact.language || artifact.type || 'txt';
    const safeName = (artifact.title || 'artifact').replace(/[/\\:*?"<>|]/g, '_');
    zip.file(`${safeName}.${ext}`, artifact.content);
  });

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'artifacts.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ============================================================================
// Artifact Tab
// ============================================================================

function ArtifactTab({
  artifact,
  isSelected,
  onSelect,
}: {
  artifact: Artifact;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
        isSelected
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
      title={artifact.title}
    >
      <FileCode className="h-3 w-3 shrink-0" />
      <span className="max-w-[120px] truncate">{artifact.title}</span>
    </button>
  );
}

// ============================================================================
// Empty State
// ============================================================================

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/50">
        <Code2 className="h-6 w-6 text-muted-foreground/60" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">No artifacts yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Code blocks from AI responses will appear here
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Artifact Content Viewer — delegates to ArtifactPreview for full
// Preview/Code tabs, versioning, sharing, and download functionality.
// ============================================================================

function ArtifactViewer({ artifact }: { artifact: Artifact }) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ArtifactPreview artifact={artifact} className="mt-0 rounded-none border-0" />
    </div>
  );
}

// ============================================================================
// Main Panel
// ============================================================================

export function ArtifactsPanel() {
  const { artifacts, selectedArtifactId, panelOpen, selectArtifact, setPanelOpen } =
    useArtifactsStore();

  const selectedArtifact = artifacts.find((a) => a.id === selectedArtifactId);

  if (!panelOpen) return null;

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm sm:hidden"
        onClick={() => setPanelOpen(false)}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={cn(
          'flex flex-col border-l border-border/30',
          'bg-card/95 backdrop-blur-xl',
          // Mobile: full-screen overlay
          'fixed inset-y-0 right-0 z-40 w-full',
          // Desktop: inline panel — responsive width
          'sm:relative sm:inset-auto sm:z-auto sm:w-full md:w-1/2 lg:w-[480px] sm:shrink-0',
          // Slide-in animation
          'animate-in slide-in-from-right duration-300',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/30 px-4 py-3">
          <div className="flex items-center gap-2">
            <PanelRightOpen className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Artifacts</h2>
            {artifacts.length > 0 && (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                {artifacts.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {artifacts.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void downloadAllArtifacts(artifacts)}
                className="h-7 px-2 text-xs"
                title="Download all artifacts as zip"
              >
                <FolderDown className="h-3.5 w-3.5" />
                <span className="ml-1 hidden sm:inline">Download all</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPanelOpen(false)}
              className="h-7 w-7 p-0"
              aria-label="Close artifacts panel"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {artifacts.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Tabs — horizontal scrollable list */}
            <div className="border-b border-border/20 px-3 py-2">
              <div className="flex gap-1 overflow-x-auto scrollbar-none">
                {artifacts.map((artifact) => (
                  <ArtifactTab
                    key={artifact.id}
                    artifact={artifact}
                    isSelected={artifact.id === selectedArtifactId}
                    onSelect={() => selectArtifact(artifact.id)}
                  />
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="flex flex-1 flex-col overflow-hidden bg-[#1e1e1e]">
              {selectedArtifact ? <ArtifactViewer artifact={selectedArtifact} /> : <EmptyState />}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ============================================================================
// Artifact Toggle Button (for use in chat header)
// ============================================================================

export function ArtifactsToggleButton() {
  const { artifacts, panelOpen, togglePanel } = useArtifactsStore();

  return (
    <button
      onClick={togglePanel}
      className={cn(
        'relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
        panelOpen
          ? 'bg-primary/15 text-primary'
          : 'bg-card/60 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-muted/60 hover:text-foreground',
      )}
      aria-label={panelOpen ? 'Close artifacts panel' : 'Open artifacts panel'}
      title="Artifacts"
    >
      <Code2 className="h-4 w-4" />
      {/* Badge showing count */}
      {artifacts.length > 0 && !panelOpen && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
          {artifacts.length}
        </span>
      )}
    </button>
  );
}
