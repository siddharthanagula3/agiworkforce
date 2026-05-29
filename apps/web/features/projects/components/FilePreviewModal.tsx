'use client';

import { useEffect, useRef, useState } from 'react';
import type { ProjectKnowledgeFile } from '@agiworkforce/types';
import MarkdownContent from '@/features/chat/components/messages/MarkdownContent';

interface Props {
  file: ProjectKnowledgeFile | null;
  onClose: () => void;
}

/**
 * FilePreviewModal -- renders a knowledge file inline.
 *
 * Images: rendered as an img with object-fit contain.
 * PDFs: embedded via iframe pointing at the storage URI.
 * Markdown (.md, .mdx): rendered via MarkdownContent (GFM + syntax highlighting).
 * Code files (.ts, .tsx, .js, .jsx, .py, .rs, .json, .css, .html, etc.):
 *   syntax-highlighted via MarkdownContent with a fenced code block.
 * Text/plain: raw pre in monospace.
 *
 * The modal is dismissible via backdrop click, the Close button, or Escape.
 */

// ---------------------------------------------------------------------------
// Extension -> language mapping for syntax highlighting
// ---------------------------------------------------------------------------

const EXT_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  cs: 'csharp',
  rb: 'ruby',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'bash',
  json: 'json',
  json5: 'json5',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  html: 'html',
  htm: 'html',
  xml: 'xml',
  svg: 'xml',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  tf: 'hcl',
  hcl: 'hcl',
  dockerfile: 'dockerfile',
  swift: 'swift',
  kt: 'kotlin',
  kts: 'kotlin',
  dart: 'dart',
  php: 'php',
  lua: 'lua',
  r: 'r',
  md: 'markdown',
  mdx: 'markdown',
};

/** Return the lowercase extension of a filename, without the leading dot. */
function fileExt(fileName: string): string {
  const name = fileName.toLowerCase();
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1) : '';
}

// ---------------------------------------------------------------------------
// Text preview subcomponent
// ---------------------------------------------------------------------------

interface TextPreviewProps {
  storageUri: string;
  fileName: string;
  /** MIME type of the file, used as fallback when extension is ambiguous */
  mimeType: string;
}

type RenderMode = 'markdown' | 'code' | 'plain';

function resolveRenderMode(fileName: string, mimeType: string): RenderMode {
  const ext = fileExt(fileName);
  if (ext === 'md' || ext === 'mdx' || ext === 'markdown') return 'markdown';
  if (ext in EXT_LANG && ext !== 'md' && ext !== 'mdx') return 'code';
  // Fallback for files with missing/wrong extensions: JSON/XML MIME gets code view.
  if (mimeType === 'application/json' || mimeType === 'application/xml') return 'code';
  return 'plain';
}

function TextPreview({ storageUri, fileName, mimeType }: TextPreviewProps) {
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

  const mode = resolveRenderMode(fileName, mimeType);

  if (mode === 'markdown') {
    return (
      <div
        style={{
          width: '100%',
          padding: '16px 20px',
          color: 'var(--agi-ink)',
          fontSize: 13,
          lineHeight: 1.65,
          boxSizing: 'border-box',
        }}
      >
        <MarkdownContent content={text} />
      </div>
    );
  }

  if (mode === 'code') {
    const ext = fileExt(fileName);
    // Prefer extension lang; fall back to sensible MIME-based guess.
    const lang = EXT_LANG[ext] ?? (mimeType === 'application/json' ? 'json' : 'text');
    // Escape backticks in content to prevent breaking out of the code fence.
    // Replace ``` with an escaped variant that markdown renderers won't interpret as a fence.
    const escapedText = text.replace(/`/g, '\\`');
    const fenced = `\`\`\`${lang}\n${escapedText}\n\`\`\``;
    return (
      <div
        style={{
          width: '100%',
          padding: '8px 12px',
          boxSizing: 'border-box',
        }}
      >
        <MarkdownContent content={fenced} />
      </div>
    );
  }

  // Plain text
  return (
    <pre
      style={{
        width: '100%',
        margin: 0,
        padding: '16px 20px',
        fontFamily: 'var(--mono)',
        fontSize: 12,
        color: 'var(--agi-ink)',
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        overflowX: 'auto',
        boxSizing: 'border-box',
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
  // A file is text-previewable if MIME is text-ish, or if its extension maps
  // to a code language (covers .ts/.tsx/.py/.rs etc. served as
  // application/octet-stream from some storage backends).
  const ext = fileExt(file.fileName);
  const isText =
    file.mimeType.startsWith('text/') ||
    file.mimeType === 'application/json' ||
    file.mimeType === 'application/xml' ||
    ext in EXT_LANG;

  const formatSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  async function handleDownload() {
    try {
      // Fetch as blob so the download attribute works cross-origin.
      // Vercel Blob serves content-disposition: inline by default, so a bare
      // anchor href would open the file in-tab instead of saving it.
      const r = await fetch(file!.storageUri);
      const blob = await r.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = file!.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Fallback: open in new tab if fetch fails (e.g. CORS on non-Blob hosts)
      window.open(file!.storageUri, '_blank', 'noopener,noreferrer');
    }
  }

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
          <div style={{ minWidth: 0, flex: 1 }}>
            <p
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--agi-ink)',
                margin: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 560,
              }}
            >
              {file.fileName}
            </p>
            <p style={{ fontSize: 11, color: 'var(--agi-ink-2)', margin: '2px 0 0' }}>
              {file.mimeType} &middot; {formatSize(file.byteCount)}
            </p>
          </div>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 12 }}
          >
            <button
              type="button"
              aria-label={`Download ${file.fileName}`}
              onClick={() => void handleDownload()}
              style={{
                background: 'transparent',
                border: '1px solid var(--agi-rule-strong)',
                borderRadius: 8,
                padding: '4px 10px',
                fontSize: 12,
                color: 'var(--agi-ink-2)',
                cursor: 'pointer',
              }}
            >
              Download
            </button>
            <button
              type="button"
              aria-label="Close preview"
              onClick={onClose}
              style={{
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
              sandbox="allow-same-origin"
              style={{ width: '100%', height: '70vh', border: 0, display: 'block' }}
            />
          )}

          {isText && (
            <TextPreview
              storageUri={file.storageUri}
              fileName={file.fileName}
              mimeType={file.mimeType}
            />
          )}

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
