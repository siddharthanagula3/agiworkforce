'use client';

import { useEffect, useState } from 'react';
import type { ProjectKnowledgeFile } from '@agiworkforce/types';

interface Props {
  projectId: string;
}

type LoadState = 'loading' | 'loaded' | 'error';

export function KnowledgeFilesPanel({ projectId }: Props) {
  const [files, setFiles] = useState<ProjectKnowledgeFile[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');

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

  return (
    <div data-testid="knowledge-files-panel">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <p
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#e8e4db',
            margin: 0,
          }}
        >
          Knowledge Files
        </p>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <button
            type="button"
            disabled
            aria-disabled="true"
            title="Cloud Managed (private beta)"
            data-testid="knowledge-files-upload-btn"
            style={{
              padding: '6px 14px',
              borderRadius: 9999,
              border: '1px solid rgba(255, 235, 205, 0.16)',
              background: 'transparent',
              color: '#b3aea4',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'not-allowed',
              opacity: 0.6,
            }}
          >
            Upload
          </button>
          <span
            role="tooltip"
            style={{
              position: 'absolute',
              top: '110%',
              right: 0,
              background: '#2a2926',
              color: '#b3aea4',
              fontSize: 11,
              padding: '4px 8px',
              borderRadius: 6,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              border: '1px solid rgba(255, 235, 205, 0.12)',
            }}
          >
            Cloud Managed (private beta)
          </span>
        </div>
      </div>

      {loadState === 'loading' && (
        <p style={{ fontSize: 12, color: '#b3aea4', textAlign: 'center', padding: '24px 0' }}>
          Loading...
        </p>
      )}

      {loadState === 'error' && (
        <p style={{ fontSize: 12, color: '#b3aea4', textAlign: 'center', padding: '24px 0' }}>
          Failed to load knowledge files.
        </p>
      )}

      {loadState === 'loaded' && files.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 16px' }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#e8e4db', margin: '0 0 6px' }}>
            No knowledge files yet
          </p>
          <p
            style={{
              fontSize: 12,
              color: '#b3aea4',
              margin: '0 auto',
              maxWidth: 480,
              lineHeight: 1.55,
            }}
          >
            Upload knowledge files to ground your project's chats in shared context. Available with
            Cloud Managed.
          </p>
        </div>
      )}

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
                border: '1px solid rgba(255, 235, 205, 0.08)',
                borderRadius: 12,
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: 13, color: '#e8e4db' }}>{file.fileName}</span>
              <span style={{ fontSize: 11, color: '#b3aea4' }}>
                {(file.byteCount / 1024).toFixed(1)} KB
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
