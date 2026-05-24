'use client';

import { useEffect, useRef, useState } from 'react';
import type { ProjectKnowledgeFile } from '@agiworkforce/types';

interface Props {
  file: ProjectKnowledgeFile | null;
  onClose: () => void;
}

/**
 * FilePreviewModal — renders a knowledge file inline.
 *
 * Images: rendered as an <img> with object-fit contain.
 * PDFs: embedded via <iframe> pointing at the storage URI.
 * Text/Markdown/JSON/CSV: renders a <pre> with the raw text content fetched
 * from the storage URI.
 *
 * The modal is dismissible via backdrop click, the Close button, or Escape.
 */

// ---------------------------------------------------------------------------
// Text preview subcomponent
// ---------------------------------------------------------------------------

interface TextPreviewProps {
  storageUri: string;
  fileName: string;
}

function TextPreview({ storageUri, fileName }: TextPreviewProps) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(storageUri)
      .then((r) => {
        if (!r.ok) throw new Error('fetch failed');
        return r.text();
      })
      .then((t) => {
        if (!cancelled) setText(t);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [storageUri]);

  if (error) {
    return (
      <div style={{ padding: 32, textAlign: 'center', width: '100%' }}>
        <p style={{ fontSize: 12, color: 'var(--agi-ink-2)', margin: 0 }}>
          Failed to load file contents.
        </p>
      </div>
    );
  }

  if (text === null) {
    return (
      <div style={{ padding: 32, textAlign: 'center', width: '100%' }}>
        <p style={{ fontSize: 12, color: 'var(--agi-ink-2)', margin: 0 }}>Loading...</p>
      </div>
    );
  }

  const isMarkdown = fileName.endsWith('.md') || fileName.endsWith('.markdown');

  return (
    <pre
      style={{
        width: '100%',
        margin: 0,
        padding: '16px 20px',
        fontFamily: 'var(--mono)',
        fontSize: isMarkdown ? 13 : 12,
        color: 'var(--agi-ink)',
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        overflowX: 'auto',
      }}
    >
      {text}
    </pre>
  );
}

// ---------------------------------------------------------------------------
// Modal shell
// ---------------------------------------------------------------------------

export function FilePreviewModal({ file, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Escape key to close
  useEffect(() => {
    if (!file) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [file, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (!file) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [file]);

  if (!file) return null;

  const isImage = file.mimeType.startsWith('image/');
  const isPdf = file.mimeType === 'application/pdf';
  const isText =
    file.mimeType.startsWith('text/') ||
    file.mimeType === 'application/json' ||
    file.mimeType === 'application/xml';

  const formatSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Preview: ${file.fileName}`}
      data-testid="file-preview-modal"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.7)',
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 800,
          maxHeight: '90vh',
          background: 'var(--agi-bg-3)',
          border: '1px solid var(--agi-rule-strong)',
          borderRadius: 16,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            borderBottom: '1px solid var(--agi-rule)',
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--agi-ink)',
                margin: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 600,
              }}
            >
              {file.fileName}
            </p>
            <p style={{ fontSize: 11, color: 'var(--agi-ink-2)', margin: '2px 0 0' }}>
              {file.mimeType} &middot; {formatSize(file.byteCount)}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close preview"
            onClick={onClose}
            style={{
              flexShrink: 0,
              marginLeft: 12,
              background: 'transparent',
              border: '1px solid var(--agi-rule-strong)',
              borderRadius: 8,
              padding: '4px 10px',
              fontSize: 12,
              color: 'var(--agi-ink-2)',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            display: 'flex',
            alignItems: isImage ? 'center' : 'flex-start',
            justifyContent: isImage ? 'center' : 'stretch',
            padding: isImage ? 24 : 0,
          }}
        >
          {isImage && (
            <img
              src={file.storageUri}
              alt={file.fileName}
              style={{
                maxWidth: '100%',
                maxHeight: '70vh',
                objectFit: 'contain',
                borderRadius: 8,
              }}
            />
          )}

          {isPdf && (
            <iframe
              src={file.storageUri}
              title={file.fileName}
              style={{ width: '100%', height: '70vh', border: 0, display: 'block' }}
            />
          )}

          {isText && <TextPreview storageUri={file.storageUri} fileName={file.fileName} />}

          {!isImage && !isPdf && !isText && (
            <div style={{ padding: 32, textAlign: 'center', width: '100%' }}>
              <p style={{ fontSize: 14, color: 'var(--agi-ink-2)', margin: 0 }}>
                Preview is not available for this file type.
              </p>
              <p style={{ fontSize: 12, color: 'var(--agi-ink-3)', margin: '8px 0 0' }}>
                {file.mimeType}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
