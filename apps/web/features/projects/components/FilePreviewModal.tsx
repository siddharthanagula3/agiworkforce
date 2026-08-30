'use client';

import { useEffect, useRef, useState } from 'react';
import { isTextAttachmentMeta, type ProjectKnowledgeFile } from '@agiworkforce/types';
import { MarkdownContent } from '@agiworkforce/unified-chat';

interface Props {
  file: ProjectKnowledgeFile | null;
  onClose: () => void;
}

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

function fileExt(fileName: string): string {
  const name = fileName.toLowerCase();
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1) : '';
}

interface TextPreviewProps {
  storageUri: string;
  fileName: string;
  mimeType: string;
}

type RenderMode = 'markdown' | 'code' | 'plain';

function resolveRenderMode(fileName: string, mimeType: string): RenderMode {
  const ext = fileExt(fileName);
  if (ext === 'md' || ext === 'mdx' || ext === 'markdown') return 'markdown';
  if (ext in EXT_LANG && ext !== 'md' && ext !== 'mdx') return 'code';
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
    const lang = EXT_LANG[ext] ?? (mimeType === 'application/json' ? 'json' : 'text');
    const escapedText = text.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
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

export function FilePreviewModal({ file, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!file) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [file, onClose]);

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
  const ext = fileExt(file.fileName);
  const isText = isTextAttachmentMeta(file.fileName, file.mimeType) || ext in EXT_LANG;

  const formatSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  async function handleDownload() {
    try {
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
        zIndex: 'var(--z-modal)',
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
              <p
                style={{
                  fontSize: 12,
                  color: 'color-mix(in srgb, var(--agi-ink) 58%, transparent)',
                  margin: '8px 0 0',
                }}
              >
                {file.mimeType}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
