'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { ALLOWED_ATTACHMENT_ACCEPT, type ProjectKnowledgeFile } from '@agiworkforce/types';
import { HardDrive, MessageSquare, Upload, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirmAction } from '@agiworkforce/ui';
import { FilePreviewModal } from './FilePreviewModal';
import { AddSourcesModal } from './AddSourcesModal';
import {
  listProjectKnowledgeFiles,
  removeProjectKnowledgeFile,
  uploadProjectKnowledgeFile,
} from '../services/project-knowledge-upload';
import { toUserMessage } from '@/lib/user-error-message';

type SortOrder = 'newest' | 'oldest';

type LoadState = 'loading' | 'loaded' | 'error';

const SOURCES_LOAD_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out loading sources.')), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

type UploadState =
  | { status: 'idle' }
  | { status: 'uploading'; fileName: string; progress: number }
  | { status: 'error'; message: string };

function fileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '🖼';
  if (mimeType === 'application/pdf') return '📄';
  if (mimeType.startsWith('text/')) return '📝';
  if (mimeType === 'application/json') return '{ }';
  return '📁';
}

interface Props {
  projectId: string;
}

export function SourcesPanel({ projectId }: Props) {
  const [files, setFiles] = useState<ProjectKnowledgeFile[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle' });
  const [previewFile, setPreviewFile] = useState<ProjectKnowledgeFile | null>(null);
  const [addSourcesOpen, setAddSourcesOpen] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [retryToken, setRetryToken] = useState(0);
  const { confirm, dialog: confirmDialog } = useConfirmAction();

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    withTimeout(listProjectKnowledgeFiles(projectId), SOURCES_LOAD_TIMEOUT_MS)
      .then((loadedFiles) => {
        if (cancelled) return;
        setFiles(loadedFiles);
        setLoadState('loaded');
      })
      .catch(() => {
        if (!cancelled) setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, retryToken]);

  async function handleDelete(file: ProjectKnowledgeFile) {
    const previous = files;
    setFiles((current) => current.filter((f) => f.id !== file.id));
    try {
      await removeProjectKnowledgeFile(projectId, file.id);
    } catch {
      setFiles(previous);
      toast.error(`Couldn't remove ${file.fileName}. Try again.`);
    }
  }

  async function handleUpload(file: File) {
    setUploadState({ status: 'uploading', fileName: file.name, progress: 0 });

    try {
      const registeredFile = await uploadProjectKnowledgeFile({
        projectId,
        file,
        onProgress: (progress) =>
          setUploadState({ status: 'uploading', fileName: file.name, progress }),
      });
      setFiles((previous) => [registeredFile, ...previous]);
      setUploadState({ status: 'idle' });
    } catch (err) {
      setUploadState({
        status: 'error',
        message: toUserMessage(err, 'Upload failed.'),
      });
      throw err;
    }
  }

  async function handleUploadText(text: string, title: string) {
    const safeTitle = title.replace(/[^\w\s-]/g, '').trim() || 'text-note';
    const fileName = `${safeTitle}.txt`;
    const blob = new Blob([text], { type: 'text/plain' });
    const file = new File([blob], fileName, { type: 'text/plain' });
    await handleUpload(file);
  }

  const displayedFiles = useMemo(() => {
    let result = [...files];

    if (typeFilter !== 'all') {
      result = result.filter((f) => {
        if (typeFilter === 'image') return f.mimeType.startsWith('image/');
        if (typeFilter === 'pdf') return f.mimeType === 'application/pdf';
        if (typeFilter === 'text') return f.mimeType.startsWith('text/');
        if (typeFilter === 'data')
          return f.mimeType === 'application/json' || f.mimeType === 'application/xml';
        return true;
      });
    }

    result.sort((a, b) => {
      const ta = new Date(a.addedAt).getTime();
      const tb = new Date(b.addedAt).getTime();
      return sortOrder === 'newest' ? tb - ta : ta - tb;
    });

    return result;
  }, [files, sortOrder, typeFilter]);

  const isUploading = uploadState.status === 'uploading';

  return (
    <div data-testid="sources-panel">
      {confirmDialog}
      {/* Upload progress / error banner */}
      {uploadState.status === 'uploading' && (
        <div
          style={{
            marginBottom: 12,
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid var(--agi-rule)',
            background: 'var(--agi-bg-2)',
            fontSize: 12,
            color: 'var(--agi-ink-2)',
          }}
        >
          Uploading &ldquo;{uploadState.fileName}&rdquo;... {uploadState.progress}%
        </div>
      )}

      {uploadState.status === 'error' && (
        <div
          style={{
            marginBottom: 12,
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid rgba(239,68,68,0.3)',
            background: 'rgba(239,68,68,0.08)',
            fontSize: 12,
            color: 'var(--agi-error)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span>{uploadState.message}</span>
          <button
            type="button"
            onClick={() => setUploadState({ status: 'idle' })}
            style={{
              flexShrink: 0,
              background: 'transparent',
              border: 0,
              padding: 0,
              color: 'var(--agi-error)',
              fontSize: 12,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Loading state */}
      {loadState === 'loading' && (
        <p
          style={{
            fontSize: 12,
            color: 'var(--agi-ink-2)',
            textAlign: 'center',
            padding: '40px 0',
          }}
        >
          Loading...
        </p>
      )}

      {/* Error state */}
      {loadState === 'error' && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
            padding: '40px 0',
          }}
        >
          <p style={{ fontSize: 12, color: 'var(--agi-ink-2)', textAlign: 'center', margin: 0 }}>
            Failed to load sources.
          </p>
          <button
            type="button"
            data-testid="sources-retry"
            onClick={() => setRetryToken((token) => token + 1)}
            style={{
              padding: '6px 16px',
              borderRadius: 9999,
              border: '1px solid var(--agi-rule-strong)',
              background: 'transparent',
              color: 'var(--agi-ink-2)',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty state (ChatGPT-style) */}
      {loadState === 'loaded' && files.length === 0 && uploadState.status !== 'uploading' && (
        <div
          data-testid="sources-empty-state"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            padding: '48px 24px',
          }}
        >
          {/* Source-type icon row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 20,
            }}
          >
            <SourceTypeIcon>
              <Upload style={{ width: 18, height: 18 }} aria-hidden="true" />
            </SourceTypeIcon>
            <SourceTypeIcon>
              <HardDrive style={{ width: 18, height: 18 }} aria-hidden="true" />
            </SourceTypeIcon>
            <SourceTypeIcon>
              <MessageSquare style={{ width: 18, height: 18 }} aria-hidden="true" />
            </SourceTypeIcon>
          </div>

          <h2
            style={{
              fontFamily: 'var(--sans)',
              fontSize: 20,
              fontWeight: 600,
              color: 'var(--agi-ink)',
              margin: '0 0 10px',
            }}
          >
            Give AGI more context
          </h2>
          <p
            style={{
              fontSize: 13,
              color: 'var(--agi-ink-2)',
              margin: '0 0 24px',
              maxWidth: 400,
              lineHeight: 1.6,
            }}
          >
            Upload sources, link drives, or connect apps to give AGI deeper context about your
            project.
          </p>

          <button
            type="button"
            onClick={() => setAddSourcesOpen(true)}
            data-testid="sources-add-btn"
            style={{
              padding: '10px 22px',
              borderRadius: 9999,
              border: 'none',
              background: 'var(--agi-amber)',
              color: 'var(--agi-bg)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.opacity = '0.88';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.opacity = '1';
            }}
          >
            Add sources
          </button>
        </div>
      )}

      {/* Files exist: show sort/filter bar + list */}
      {loadState === 'loaded' && files.length > 0 && (
        <>
          {/* Sort + filter bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 14,
              gap: 8,
            }}
          >
            {/* Left: file count + "Add sources" */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--agi-ink-2)' }}>
                {files.length} {files.length === 1 ? 'source' : 'sources'}
              </span>
              <button
                type="button"
                onClick={() => setAddSourcesOpen(true)}
                data-testid="sources-add-btn-inline"
                style={{
                  padding: '4px 12px',
                  borderRadius: 9999,
                  border: '1px solid var(--agi-amber)',
                  background: 'transparent',
                  color: 'var(--agi-amber)',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                + Add sources
              </button>
            </div>

            {/* Right: sort + filter selects */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                aria-label="Filter sources by type"
                data-testid="sources-type-filter"
                style={{
                  padding: '4px 8px',
                  borderRadius: 8,
                  border: '1px solid var(--agi-rule-strong)',
                  background: 'var(--agi-bg-2)',
                  color: 'var(--agi-ink)',
                  fontSize: 12,
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="all">All</option>
                <option value="image">Images</option>
                <option value="pdf">PDFs</option>
                <option value="text">Text</option>
                <option value="data">Data (JSON/XML)</option>
              </select>

              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                aria-label="Sort sources"
                data-testid="sources-sort"
                style={{
                  padding: '4px 8px',
                  borderRadius: 8,
                  border: '1px solid var(--agi-rule-strong)',
                  background: 'var(--agi-bg-2)',
                  color: 'var(--agi-ink)',
                  fontSize: 12,
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
              </select>
            </div>
          </div>

          {/* File list */}
          {displayedFiles.length === 0 ? (
            <p
              style={{
                fontSize: 12,
                color: 'var(--agi-ink-2)',
                textAlign: 'center',
                padding: '24px 0',
              }}
            >
              No sources match the current filter.
            </p>
          ) : (
            <ul
              style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 0, margin: 0 }}
              data-testid="sources-file-list"
            >
              {displayedFiles.map((file) => (
                <li
                  key={file.id}
                  style={{
                    listStyle: 'none',
                    border: '1px solid var(--agi-rule)',
                    borderRadius: 12,
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    cursor: 'pointer',
                  }}
                  onClick={() => setPreviewFile(file)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Preview ${file.fileName}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setPreviewFile(file);
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLLIElement).style.background = 'var(--agi-bg-3)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLLIElement).style.background = 'transparent';
                  }}
                >
                  <span style={{ fontSize: 16, flexShrink: 0 }} aria-hidden>
                    {fileIcon(file.mimeType)}
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      color: 'var(--agi-ink)',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {file.fileName}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--agi-ink-2)', flexShrink: 0 }}>
                    {(file.byteCount / 1024).toFixed(1)} KB
                  </span>
                  <button
                    type="button"
                    data-testid="sources-delete"
                    aria-label={`Remove ${file.fileName}`}
                    title="Remove source"
                    onClick={(e) => {
                      e.stopPropagation();
                      confirm({
                        title: `Remove ${file.fileName}?`,
                        description:
                          'The file is deleted from this project’s knowledge and the assistant stops using it. This cannot be undone: the file would have to be uploaded again.',
                        confirmLabel: 'Remove file',
                        onConfirm: () => handleDelete(file),
                      });
                    }}
                    style={{
                      flexShrink: 0,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--agi-ink-2)',
                      padding: 4,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Drop overlay when files already exist */}
          <DropOverlay onDrop={handleUpload} />
        </>
      )}

      {/* Hidden file input for direct upload (legacy path, kept for keyboard users) */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_ATTACHMENT_ACCEPT}
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleUpload(file);
          e.target.value = '';
        }}
        data-testid="sources-file-input"
      />

      {/* Add sources modal */}
      <AddSourcesModal
        open={addSourcesOpen}
        onClose={() => setAddSourcesOpen(false)}
        onUploadFile={handleUpload}
        onUploadText={handleUploadText}
        isUploading={isUploading}
        accept={ALLOWED_ATTACHMENT_ACCEPT}
      />

      {/* File preview modal */}
      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </div>
  );
}

function SourceTypeIcon({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        border: '1px solid var(--agi-rule-strong)',
        background: 'var(--agi-bg-2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--agi-ink-2)',
      }}
    >
      {children}
    </div>
  );
}

function DropOverlay({ onDrop }: { onDrop: (file: File) => void }) {
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div
      data-testid="sources-drop-overlay"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onDrop(file);
      }}
      style={{
        marginTop: 8,
        border: `1px dashed ${isDragging ? 'var(--agi-amber)' : 'var(--agi-rule)'}`,
        borderRadius: 8,
        padding: '8px 12px',
        textAlign: 'center',
        fontSize: 12,
        color: 'var(--agi-ink-2)',
        cursor: 'default',
        transition: 'border-color 0.15s',
      }}
    >
      Drop another file to add it
    </div>
  );
}
