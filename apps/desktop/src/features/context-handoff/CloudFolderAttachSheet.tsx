import { useCallback, useEffect, useMemo, useState } from 'react';
import { LocalByokHandoffDialog } from '@agiworkforce/unified-chat';
import { buildLocalToByokHandoffDraft, type LocalToByokHandoffPreview } from '@agiworkforce/utils';
import type { HandoffContextItem } from '@agiworkforce/types';
import {
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_COUNT,
} from '@agiworkforce/cloud-contracts';
import {
  isSelectionWithinCaps,
  selectDefaultCandidates,
  toFolderCandidates,
  type FolderCandidate,
} from './folderCandidates';
import { readFolderFiles, type ApprovedFolderFile } from './readFolderFiles';
import { listCloudHandoffFiles } from './cloudHandoffGrant';

export const CLOUD_FOLDER_CONSENT_TTL_MS = 15 * 60 * 1000;
const FOLDER_DISCOVERY_LIMIT = 1000;
const EXPIRED_PREVIEW_ERROR =
  'This payload preview expired. Change the selection to build a fresh preview, or close and pick the folder again.';

export interface CloudFolderReadResult {
  files: ApprovedFolderFile[];
  defaultSelectedIds: string[];
  discoveryTruncated: boolean;
  omittedForCap: number;
  omittedDuringRead: number;
}

export interface CloudFolderAttachSheetProps {
  folderPath: string | null;
  folderGrantId: string | null;
  sourceSessionId: string;
  managedBoundaryActive: boolean;
  onClose: () => void;
  onApprove: (files: File[]) => void;
  readCandidates?: (folderGrantId: string) => Promise<CloudFolderReadResult>;
}

async function readFolderThroughTauri(folderGrantId: string): Promise<CloudFolderReadResult> {
  const { matches, truncated } = await listCloudHandoffFiles(folderGrantId, FOLDER_DISCOVERY_LIMIT);
  const candidates = toFolderCandidates(matches);
  const initialSelection = selectDefaultCandidates(candidates);
  const files = await readFolderFiles(folderGrantId, initialSelection.selected);
  const readTimeSelection = selectDefaultCandidates(files.map((file) => file.candidate));

  return {
    files,
    defaultSelectedIds: readTimeSelection.selected.map((candidate) => candidate.relativePath),
    discoveryTruncated: truncated,
    omittedForCap: initialSelection.omittedForCap + readTimeSelection.omittedForCap,
    omittedDuringRead: initialSelection.selected.length - files.length,
  };
}

function plural(count: number, singular: string, pluralLabel = `${singular}s`): string {
  return count === 1 ? singular : pluralLabel;
}

function folderReadNotice(result: CloudFolderReadResult): string | null {
  const notices: string[] = [];
  if (result.discoveryTruncated) {
    notices.push(
      `File discovery reached its ${FOLDER_DISCOVERY_LIMIT.toLocaleString()}-result limit; files beyond that limit were not reviewed.`,
    );
  }
  if (result.omittedForCap > 0) {
    notices.push(
      `${result.omittedForCap} eligible ${plural(result.omittedForCap, 'file')} ${result.omittedForCap === 1 ? 'was' : 'were'} left unselected because Managed Cloud accepts at most ${MAX_CHAT_ATTACHMENT_COUNT} files and ${Math.floor(MAX_CHAT_ATTACHMENT_BYTES / (1024 * 1024))} MB per message.`,
    );
  }
  if (result.omittedDuringRead > 0) {
    notices.push(
      `${result.omittedDuringRead} selected ${plural(result.omittedDuringRead, 'file')} changed, disappeared, or could not be read and ${result.omittedDuringRead === 1 ? 'was' : 'were'} left out.`,
    );
  }
  return notices.length > 0 ? notices.join(' ') : null;
}

function previewMatchesFiles(
  preview: LocalToByokHandoffPreview,
  selectedFiles: readonly ApprovedFolderFile[],
): boolean {
  if (preview.draft.selectedContext.length !== selectedFiles.length) return false;
  const previewById = new Map(preview.draft.selectedContext.map((item) => [item.id, item]));
  return selectedFiles.every((approved) => {
    const item = previewById.get(approved.candidate.relativePath);
    return (
      item?.checksumSha256 === approved.checksumSha256 &&
      item.byteCount === approved.file.size &&
      approved.candidate.byteCount === approved.file.size
    );
  });
}

export function CloudFolderAttachSheet({
  folderPath,
  folderGrantId,
  sourceSessionId,
  managedBoundaryActive,
  onClose,
  onApprove,
  readCandidates = readFolderThroughTauri,
}: CloudFolderAttachSheetProps) {
  const [available, setAvailable] = useState<ApprovedFolderFile[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<LocalToByokHandoffPreview | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if ((folderPath || folderGrantId) && !managedBoundaryActive) onClose();
  }, [folderPath, folderGrantId, managedBoundaryActive, onClose]);

  useEffect(() => {
    if (!folderPath || !folderGrantId || !managedBoundaryActive) {
      setAvailable([]);
      setSelectedIds([]);
      setPreview(null);
      setError(null);
      setNotice(null);
      return;
    }
    let cancelled = false;
    setIsBuilding(true);
    setAvailable([]);
    setSelectedIds([]);
    setPreview(null);
    setError(null);
    setNotice(null);
    void readCandidates(folderGrantId)
      .then((result) => {
        if (cancelled) return;
        setAvailable(result.files);
        setSelectedIds(result.defaultSelectedIds);
        setNotice(folderReadNotice(result));
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
  }, [folderPath, folderGrantId, managedBoundaryActive, readCandidates]);

  const selectedFiles = useMemo(
    () => available.filter((f) => selectedIds.includes(f.candidate.relativePath)),
    [available, selectedIds],
  );

  useEffect(() => {
    if (!folderPath || !folderGrantId || !managedBoundaryActive || selectedFiles.length === 0) {
      setPreview(null);
      if (selectedFiles.length === 0) setError(null);
      return;
    }
    let cancelled = false;
    setIsBuilding(true);
    setPreview(null);
    setError(null);
    void buildLocalToByokHandoffDraft({
      sourceSessionId,
      sourceSurface: 'desktop',
      targetSurface: 'desktop',
      target: 'managed',
      selectedContext: selectedFiles.map((f) => ({
        id: f.candidate.relativePath,
        kind: 'file' as const,
        label: f.candidate.relativePath,
        sourceUri: f.candidate.relativePath,
        byteCount: f.candidate.byteCount,
        checksumSha256: f.checksumSha256,
        content: f.content,
      })),
      expiresAt: new Date(Date.now() + CLOUD_FOLDER_CONSENT_TTL_MS).toISOString(),
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
  }, [folderPath, folderGrantId, managedBoundaryActive, selectedFiles, sourceSessionId]);

  useEffect(() => {
    if (!preview) return;
    const expiresAt = Date.parse(preview.draft.expiresAt);
    const remainingMs = expiresAt - Date.now();
    if (!Number.isFinite(expiresAt) || remainingMs <= 0) {
      setError(EXPIRED_PREVIEW_ERROR);
      return;
    }
    const timeout = window.setTimeout(() => setError(EXPIRED_PREVIEW_ERROR), remainingMs);
    return () => window.clearTimeout(timeout);
  }, [preview]);

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
    if (!managedBoundaryActive || !preview || preview.redactionReport.blocked || error) return;
    const expiresAt = Date.parse(preview.draft.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      setError(EXPIRED_PREVIEW_ERROR);
      return;
    }
    if (!isSelectionWithinCaps(selectedFiles.map((f) => f.candidate) as FolderCandidate[])) return;
    if (!previewMatchesFiles(preview, selectedFiles)) {
      setError(
        'The selected files no longer match this payload preview. Change the selection and review it again.',
      );
      return;
    }
    onApprove(selectedFiles.map((f) => f.file));
    onClose();
  }, [managedBoundaryActive, preview, error, selectedFiles, onApprove, onClose]);

  const selectionCapError =
    selectedFiles.length > 0 &&
    !isSelectionWithinCaps(selectedFiles.map((file) => file.candidate) as FolderCandidate[])
      ? `Select at most ${MAX_CHAT_ATTACHMENT_COUNT} files totaling no more than ${Math.floor(MAX_CHAT_ATTACHMENT_BYTES / (1024 * 1024))} MB.`
      : null;

  if (!folderPath || !folderGrantId || !managedBoundaryActive) return null;

  return (
    <LocalByokHandoffDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      preview={preview}
      isBuilding={isBuilding}
      error={error ?? selectionCapError}
      notice={notice}
      onConfirm={handleConfirm}
      candidates={candidates}
      selectedContextIds={selectedIds}
      onToggleContext={toggleContext}
      target="managed"
      confirmLabel="Attach to cloud chat"
      targetProviderLabel="AGI Managed Cloud"
      unscannedContextCount={
        selectedFiles.filter((file) => file.secretScanStatus === 'unscanned-binary').length
      }
    />
  );
}
