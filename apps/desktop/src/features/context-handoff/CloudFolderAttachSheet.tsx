/**
 * CloudFolderAttachSheet — the consent surface for attaching local folder files
 * to a Managed Cloud conversation.
 *
 * Picking a folder in Cloud mode grants nothing (see `hooks/useFolderSelection`).
 * This sheet is where local bytes actually become cloud-bound, and it is the
 * only place that decision is made, so it carries the whole ceremony the locked
 * trust boundary requires: context selection, secret scan, payload preview,
 * consent, and a visible target.
 *
 * It fires ONCE, at confirm — not per send and not per file. The bytes are
 * frozen into `File` objects at read time, so `previewHashSha256` covers exactly
 * what will upload. Approving later, or re-rendering, cannot change the payload
 * the user agreed to.
 *
 * The reader is injectable because the guarantee this component exists to
 * provide — that blocked content cannot reach the composer — must be testable
 * without a Tauri mock standing between the assertion and the behaviour.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LocalByokHandoffDialog } from '@agiworkforce/unified-chat';
import { buildLocalToByokHandoffDraft, type LocalToByokHandoffPreview } from '@agiworkforce/utils';
import type { HandoffContextItem } from '@agiworkforce/types';
import { globSearch } from '../../api/codeSearch';
import {
  isSelectionWithinCaps,
  selectDefaultCandidates,
  toFolderCandidates,
  type FolderCandidate,
} from './folderCandidates';
import { readFolderFiles, type ApprovedFolderFile } from './readFolderFiles';

/** Consent expires so an abandoned sheet cannot be confirmed much later. */
const CONSENT_TTL_MS = 15 * 60 * 1000;

export interface CloudFolderAttachSheetProps {
  /** Absolute path of the picked folder, or null when the sheet is closed. */
  folderPath: string | null;
  /** Conversation the approved files will ride on. */
  sourceSessionId: string;
  onClose: () => void;
  /** Receives the approved files, already named by their folder-relative path. */
  onApprove: (files: File[]) => void;
  /**
   * Test seam. Production reads the folder through Tauri; tests inject
   * candidates directly so the consent guarantee is asserted against this
   * component rather than against a mock.
   */
  readCandidates?: (folderPath: string) => Promise<ApprovedFolderFile[]>;
}

async function readFolderThroughTauri(folderPath: string): Promise<ApprovedFolderFile[]> {
  const { matches } = await globSearch('**/*', folderPath, 1000);
  const candidates = toFolderCandidates(matches);
  const { selected } = selectDefaultCandidates(candidates);
  return readFolderFiles(selected);
}

export function CloudFolderAttachSheet({
  folderPath,
  sourceSessionId,
  onClose,
  onApprove,
  readCandidates = readFolderThroughTauri,
}: CloudFolderAttachSheetProps) {
  const [available, setAvailable] = useState<ApprovedFolderFile[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<LocalToByokHandoffPreview | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read the folder whenever a new one is picked.
  useEffect(() => {
    if (!folderPath) {
      setAvailable([]);
      setSelectedIds([]);
      setPreview(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setIsBuilding(true);
    setError(null);
    void readCandidates(folderPath)
      .then((files) => {
        if (cancelled) return;
        setAvailable(files);
        setSelectedIds(files.map((f) => f.candidate.relativePath));
      })
      .catch((readError: unknown) => {
        if (cancelled) return;
        setError(readError instanceof Error ? readError.message : 'Could not read that folder.');
      })
      .finally(() => {
        if (!cancelled) setIsBuilding(false);
      });
    return () => {
      cancelled = true;
    };
  }, [folderPath, readCandidates]);

  const selectedFiles = useMemo(
    () => available.filter((f) => selectedIds.includes(f.candidate.relativePath)),
    [available, selectedIds],
  );

  // Rebuild the preview whenever the selection changes, so unticking a flagged
  // file clears the block rather than dead-ending the flow on any real repo.
  useEffect(() => {
    if (!folderPath || selectedFiles.length === 0) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setIsBuilding(true);
    void buildLocalToByokHandoffDraft({
      sourceSessionId,
      sourceSurface: 'desktop',
      targetSurface: 'desktop',
      target: 'managed',
      selectedContext: selectedFiles.map((f) => ({
        id: f.candidate.relativePath,
        kind: 'file' as const,
        // Relative throughout: the payload never carries a home directory.
        label: f.candidate.relativePath,
        sourceUri: f.candidate.relativePath,
        content: f.content,
      })),
      expiresAt: new Date(Date.now() + CONSENT_TTL_MS).toISOString(),
      blockOnFindings: true,
    })
      .then((built) => {
        if (!cancelled) setPreview(built);
      })
      .catch((buildError: unknown) => {
        if (cancelled) return;
        setError(buildError instanceof Error ? buildError.message : 'Could not build the preview.');
      })
      .finally(() => {
        if (!cancelled) setIsBuilding(false);
      });
    return () => {
      cancelled = true;
    };
  }, [folderPath, selectedFiles, sourceSessionId]);

  const candidates = useMemo<HandoffContextItem[]>(
    () =>
      available.map((f) => ({
        id: f.candidate.relativePath,
        kind: 'file' as const,
        label: f.candidate.relativePath,
        sourceUri: f.candidate.relativePath,
        byteCount: f.candidate.byteCount,
      })),
    [available],
  );

  const toggleContext = useCallback((contextId: string) => {
    setSelectedIds((previous) =>
      previous.includes(contextId)
        ? previous.filter((id) => id !== contextId)
        : [...previous, contextId],
    );
  }, []);

  const handleConfirm = useCallback(() => {
    // Defence in depth. The dialog already disables confirm while blocked, but
    // this component owns the guarantee, so it re-checks rather than trusting
    // its own UI.
    if (!preview || preview.redactionReport.blocked) return;
    if (!isSelectionWithinCaps(selectedFiles.map((f) => f.candidate) as FolderCandidate[])) return;
    onApprove(selectedFiles.map((f) => f.file));
    onClose();
  }, [preview, selectedFiles, onApprove, onClose]);

  if (!folderPath) return null;

  return (
    <LocalByokHandoffDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      preview={preview}
      isBuilding={isBuilding}
      error={error}
      onConfirm={handleConfirm}
      candidates={candidates}
      selectedContextIds={selectedIds}
      onToggleContext={toggleContext}
      target="managed"
      confirmLabel="Attach to cloud chat"
      targetProviderLabel="AGI Managed Cloud"
    />
  );
}
