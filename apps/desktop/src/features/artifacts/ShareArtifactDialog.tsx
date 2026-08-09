/**
 * Share dialog for a Local-mode desktop artifact.
 *
 * This dialog only ever explains why there is no link; it has no publish path.
 * Keep the copy matched to what desktop actually implements:
 * `features/artifacts/publishAdapter.ts` injects a `localFileWriter` only, and
 * nothing on this surface injects a `CloudPublisher` — the web adapter
 * (`apps/web/features/chat/components/artifacts/publishArtifactClient.ts`,
 * wired in `ArtifactsPanel.tsx:208`) is still the only one in the repo. Cloud
 * mode on desktop does not change that: `DesktopShellV3` renders the shared
 * `@agiworkforce/unified-chat` panel there, and `ChatInterface` passes it no
 * `publishArtifact` prop, so its "Publish" falls back to a clipboard markdown
 * snapshot (`packages/ui/unified-chat/src/components/ArtifactPanel.tsx:558-570`).
 * So the dialog must not send the user to Cloud mode for a hosted link.
 */
import { Lock, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { Artifact } from '@/stores/artifactStore';

interface ShareArtifactDialogProps {
  artifact: Artifact;
  isOpen: boolean;
  onClose: () => void;
}

export function ShareArtifactDialog({ artifact, isOpen, onClose }: ShareArtifactDialogProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
            <Lock className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">
              Local artifacts cannot be shared
            </h2>
            <p className="truncate text-xs text-muted-foreground">{artifact.title}</p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/40 p-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            A Local-mode artifact never leaves this device, so there is nothing for a share link to
            point at. Copy or download it here instead. The desktop app cannot publish an artifact
            to a hosted link in any mode — only the web app can, and no account setting changes that
            here.
          </p>
        </div>

        <div className="mt-5 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ShareArtifactDialog;
