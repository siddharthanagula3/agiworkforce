'use client';

import { useEffect, useRef, useState } from 'react';
import type { ProjectKnowledgeFile } from '@agiworkforce/types';
import { put } from '@vercel/blob';
import { getCsrfToken } from '@/lib/client/csrf';
import { FilePreviewModal } from './FilePreviewModal';

interface Props {
  projectId: string;
}

type LoadState = 'loading' | 'loaded' | 'error';

type UploadState =
  | { status: 'idle' }
  | { status: 'uploading'; fileName: string; progress: number }
  | { status: 'error'; message: string };

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MiB — mirrors MAX_ATTACHMENT_BYTES

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/xml',
  'text/html',
]);

/** Compute SHA-256 hex digest of an ArrayBuffer. */
async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Return a file-type icon character based on MIME type. */
function fileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '🖼';
  if (mimeType === 'application/pdf') return '📄';
  if (mimeType.startsWith('text/')) return '📝';
  if (mimeType === 'application/json') return '{ }';
  return '📁';
}

export function KnowledgeFilesPanel({ projectId }: Props) {
  const [files, setFiles] = useState<ProjectKnowledgeFile[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle' });
  const [isDragging, setIsDragging] = useState(false);
  const [previewFile, setPreviewFile] = useState<ProjectKnowledgeFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load files on mount / projectId change
  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    fetch(`/api/projects/${encodeURIComponent(projectId)}/knowledge-files`)
      .then((r) => r.json())
      .then((data: unknown) => {
        if (cancelled) return;
        const body = data as { files?: ProjectKnowledgeFile[] };
        setFiles(body.files ?? []);
        setLoadState('loaded');
      })
      .catch(() => {
        if (!cancelled) setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function handleUpload(file: File) {
    // Client-side validation
    if (file.size > MAX_FILE_BYTES) {
      setUploadState({
        status: 'error',
        message: `File too large. Maximum size is ${MAX_FILE_BYTES / 1024 / 1024} MiB.`,
      });
      return;
    }
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      setUploadState({
        status: 'error',
        message: `File type "${file.type}" is not supported.`,
      });
      return;
    }

    setUploadState({ status: 'uploading', fileName: file.name, progress: 0 });

    try {
      // 1. Read file into ArrayBuffer for checksum
      const arrayBuffer = await file.arrayBuffer();
      const checksumSha256 = await sha256Hex(arrayBuffer);

      // 2. Upload to Vercel Blob (requires BLOB_READ_WRITE_TOKEN on the server)
      const timestamp = Date.now();
      const ext = file.name.split('.').pop() ?? 'bin';
      const storagePath = `knowledge-files/projects/${projectId}/${timestamp}_${checksumSha256.slice(0, 8)}.${ext}`;

      const uploadedBlob = await put(storagePath, file, {
        access: 'public',
        contentType: file.type || 'application/octet-stream',
      });

      setUploadState({ status: 'uploading', fileName: file.name, progress: 80 });

      const storageUri = uploadedBlob.url;

      // 3. Register the file via the API
      const csrfToken = await getCsrfToken();
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/knowledge-files`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken,
          },
          body: JSON.stringify({
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            byteCount: file.size,
            checksumSha256,
            sourceSurface: 'web',
            storageUri,
          }),
        },
      );

      const json = (await response.json()) as {
        file?: ProjectKnowledgeFile;
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        if (json.error === 'knowledge_files_unavailable') {
          throw new Error('Knowledge files require Cloud Managed (not yet available).');
        }
        throw new Error(json.message ?? `Server error ${response.status}`);
      }

      if (json.file) {
        setFiles((prev) => [json.file!, ...prev]);
      }
      setUploadState({ status: 'idle' });
    } catch (err) {
      setUploadState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Upload failed.',
      });
    }
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleUpload(file);
    // Reset so the same file can be re-uploaded after dismissing an error
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
              style={{ fontSize: 11, fontWeight: 400, color: 'var(--agi-ink-2)', marginLeft: 6 }}
            >
              {files.length} {files.length === 1 ? 'file' : 'files'} &middot; {totalKb} KB
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
          accept={Array.from(ALLOWED_MIME_TYPES).join(',')}
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
            color: '#f87171',
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
              color: '#f87171',
              fontSize: 11,
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
            background: isDragging ? 'rgba(200,137,42,0.05)' : 'transparent',
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
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {file.fileName}
              </span>
              <span style={{ fontSize: 11, color: 'var(--agi-ink-2)', flexShrink: 0 }}>
                {(file.byteCount / 1024).toFixed(1)} KB
              </span>
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
            fontSize: 11,
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
