'use client';

import { useConfirmAction } from '@agiworkforce/ui';

import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  ALLOWED_ATTACHMENT_ACCEPT,
  MAX_PROJECT_KNOWLEDGE_FILES,
  type ProjectKnowledgeFile,
} from '@agiworkforce/types';
import { FilePreviewModal } from './FilePreviewModal';
import { uploadProjectKnowledgeFile } from '../services/project-knowledge-upload';
import { getCsrfToken } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';

interface Props {
  projectId: string;
}

type LoadState = 'loading' | 'loaded' | 'error';

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

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function KnowledgeFilesPanel({ projectId }: Props) {
  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const [files, setFiles] = useState<ProjectKnowledgeFile[]>([]);
  // Account-wide, not this project's total: the upload cap is account-wide, so
  // a per-project number would promise headroom the server will refuse.
  const [storage, setStorage] = useState<{
    usedBytes: number | null;
    limitBytes: number | null;
  } | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle' });
  const [isDragging, setIsDragging] = useState(false);
  const [previewFile, setPreviewFile] = useState<ProjectKnowledgeFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    fetch(`/api/projects/${encodeURIComponent(projectId)}/knowledge-files`)
      .then((r) => r.json())
      .then((data: unknown) => {
        if (cancelled) return;
        const body = data as {
          files?: ProjectKnowledgeFile[];
          storage?: { usedBytes: number | null; limitBytes: number | null };
        };
        setFiles(body.files ?? []);
        setStorage(body.storage ?? null);
        setLoadState('loaded');
      })
      .catch(() => {
        if (!cancelled) setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function handleDelete(file: ProjectKnowledgeFile) {
    const previous = files;
    setFiles((current) => current.filter((f) => f.id !== file.id));
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/knowledge-files/${encodeURIComponent(file.id)}`,
        { method: 'DELETE', headers: { 'x-csrf-token': csrfToken }, credentials: 'include' },
      );
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
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
    }
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleUpload(file);
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleUpload(file);
  }

  const isUploading = uploadState.status === 'uploading';
  const totalBytes = files.reduce((s, f) => s + f.byteCount, 0);
  const totalKb = (totalBytes / 1024).toFixed(1);

  return (
    <div data-testid="knowledge-files-panel">
      {confirmDialog}
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--agi-ink)', margin: 0 }}>
          Knowledge Files
          {files.length > 0 && (
            <span
              style={{ fontSize: 12, fontWeight: 400, color: 'var(--agi-ink-2)', marginLeft: 6 }}
            >
              {/*
                The cap was invisible until the upload route refused the 21st
                file. A project holding 20 files is at its limit and the only
                way to learn that was to be told no.
              */}
              {files.length} of {MAX_PROJECT_KNOWLEDGE_FILES} files &middot; {totalKb} KB
              {storage && storage.usedBytes !== null && storage.limitBytes !== null ? (
                <>
                  {' '}
                  &middot;{' '}
                  <span
                    style={{
                      color:
                        storage.usedBytes / storage.limitBytes >= 0.9
                          ? 'var(--agi-amber)'
                          : undefined,
                    }}
                  >
                    {formatBytes(storage.usedBytes)} of {formatBytes(storage.limitBytes)} storage
                    used
                  </span>
                </>
              ) : null}
              {files.length >= MAX_PROJECT_KNOWLEDGE_FILES && (
                <span style={{ color: 'var(--agi-amber)', marginLeft: 6 }}>
                  &middot; full — remove one to add another
                </span>
              )}
            </span>
          )}
        </p>
        <button
          type="button"
          disabled={isUploading}
          onClick={() => fileInputRef.current?.click()}
          data-testid="knowledge-files-upload-btn"
          style={{
            padding: '6px 14px',
            borderRadius: 9999,
            border: '1px solid var(--agi-rule-strong)',
            background: 'transparent',
            color: isUploading ? 'var(--agi-ink-2)' : 'var(--agi-ink)',
            fontSize: 12,
            fontWeight: 500,
            cursor: isUploading ? 'not-allowed' : 'pointer',
            opacity: isUploading ? 0.6 : 1,
          }}
        >
          {isUploading ? `Uploading...` : 'Upload'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_ATTACHMENT_ACCEPT}
          style={{ display: 'none' }}
          onChange={handleFileInputChange}
          data-testid="knowledge-files-input"
        />
      </div>

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

      {/* Dropzone (shown when no files and not loading) */}
      {loadState === 'loaded' && files.length === 0 && uploadState.status !== 'uploading' && (
        <div
          data-testid="knowledge-files-dropzone"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="Drop a file here or click to upload"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
          }}
          style={{
            border: `2px dashed ${isDragging ? 'var(--agi-amber)' : 'var(--agi-rule-strong)'}`,
            borderRadius: 12,
            padding: '32px 16px',
            textAlign: 'center',
            cursor: 'pointer',
            background: isDragging ? 'var(--agi-amber-soft)' : 'transparent',
            transition: 'border-color 0.15s, background 0.15s',
          }}
        >
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--agi-ink)', margin: '0 0 6px' }}>
            No knowledge files yet
          </p>
          <p
            style={{
              fontSize: 12,
              color: 'var(--agi-ink-2)',
              margin: '0 auto',
              maxWidth: 480,
              lineHeight: 1.55,
            }}
          >
            Drop a file here or click Upload to add context files. Images, PDFs, text, and JSON are
            supported.
          </p>
        </div>
      )}

      {loadState === 'loading' && (
        <p
          style={{
            fontSize: 12,
            color: 'var(--agi-ink-2)',
            textAlign: 'center',
            padding: '24px 0',
          }}
        >
          Loading...
        </p>
      )}

      {loadState === 'error' && (
        <p
          style={{
            fontSize: 12,
            color: 'var(--agi-ink-2)',
            textAlign: 'center',
            padding: '24px 0',
          }}
        >
          Failed to load knowledge files.
        </p>
      )}

      {/* File list */}
      {loadState === 'loaded' && files.length > 0 && (
        <ul
          style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 0, margin: 0 }}
          data-testid="knowledge-files-list"
        >
          {files.map((file) => (
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
            >
              <span style={{ fontSize: 16, flexShrink: 0 }} aria-hidden>
                {fileIcon(file.mimeType)}
              </span>
              <span
                style={{
                  fontSize: 13,
                  color: 'var(--agi-ink)',
                  flex: 1,
                  // Without minWidth a flex child refuses to shrink below its
                  // content, so a long file name pushes the size and delete
                  // controls out of the row instead of ellipsing.
                  minWidth: 0,
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
                data-testid="knowledge-files-delete"
                aria-label={`Remove ${file.fileName}`}
                title="Remove file"
                onClick={(e) => {
                  e.stopPropagation();
                  confirm({
                    title: `Remove ${file.fileName}?`,
                    description:
                      'The file is deleted from this project\u2019s knowledge and the assistant stops using it. This cannot be undone \u2014 the file would have to be uploaded again.',
                    confirmLabel: 'Remove file',
                    onConfirm: () => handleDelete(file),
                  });
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
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

      {/* Drag-over overlay when files already exist */}
      {loadState === 'loaded' && files.length > 0 && (
        <div
          data-testid="knowledge-files-drop-overlay"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
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
      )}

      {/* File preview modal */}
      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </div>
  );
}
