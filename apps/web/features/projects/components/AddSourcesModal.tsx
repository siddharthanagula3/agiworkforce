'use client';

import { useEffect, useRef, useState } from 'react';
import { Upload, FileText, HardDrive, MessageSquare, X, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toUserMessage } from '@/lib/user-error-message';

interface Props {
  open: boolean;
  onClose: () => void;
  onUploadFile: (file: File) => Promise<void>;
  onUploadText: (text: string, title: string) => Promise<void>;
  isUploading?: boolean;
  accept?: string;
}

export function AddSourcesModal({
  open,
  onClose,
  onUploadFile,
  onUploadText,
  isUploading = false,
  accept,
}: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  const [view, setView] = useState<'main' | 'text-input'>('main');
  const [textTitle, setTextTitle] = useState('');
  const [textContent, setTextContent] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setView('main');
      setTextTitle('');
      setTextContent('');
      setIsDragging(false);
      setIsSubmitting(false);
      setSubmitError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (view === 'text-input') {
          setView('main');
        } else {
          onClose();
        }
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose, view]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (view === 'text-input' && textInputRef.current) {
      textInputRef.current.focus();
    }
  }, [view]);

  if (!open) return null;

  async function submitFile(file: File) {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await onUploadFile(file);
      onClose();
    } catch (error) {
      setSubmitError(toUserMessage(error, 'Could not add this source.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void submitFile(file);
    }
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      void submitFile(file);
    }
    e.target.value = '';
  }

  async function handleTextSubmit() {
    const text = textContent.trim();
    if (!text) return;
    const title = textTitle.trim() || 'Text note';
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await onUploadText(text, title);
      onClose();
    } catch (error) {
      setSubmitError(toUserMessage(error, 'Could not add this source.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleConnectorRoute(path: string) {
    onClose();
    router.push(path);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add sources"
      data-testid="add-sources-modal"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
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
          maxWidth: 520,
          background: 'var(--agi-bg)',
          border: '1px solid var(--agi-rule-strong)',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 8px 40px rgba(0,0,0,0.32)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 20px 14px',
            borderBottom: '1px solid var(--agi-rule)',
          }}
        >
          <h2
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: 'var(--agi-ink)',
              margin: 0,
            }}
          >
            {view === 'text-input' ? 'Add text' : 'Add sources'}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              width: 30,
              height: 30,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--agi-ink-2)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--agi-bg-3)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
          >
            <X style={{ width: 16, height: 16 }} aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 20px 24px' }}>
          {view === 'main' ? (
            <>
              {/* Drag-drop zone */}
              <div
                data-testid="add-sources-dropzone"
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                style={{
                  border: `2px dashed ${isDragging ? 'var(--agi-amber)' : 'var(--agi-rule-strong)'}`,
                  borderRadius: 12,
                  padding: '28px 16px',
                  textAlign: 'center',
                  background: isDragging ? 'rgba(200,137,42,0.06)' : 'var(--agi-bg-2)',
                  transition: 'border-color 0.15s, background 0.15s',
                  marginBottom: 20,
                }}
              >
                <p
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: 'var(--agi-ink)',
                    margin: '0 0 4px',
                  }}
                >
                  Drag sources here
                </p>
                <p
                  style={{
                    fontSize: 12,
                    color: 'var(--agi-ink-2)',
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  Or use the options below to upload files, add text, or connect services.
                </p>
              </div>

              {/* Source-type buttons row */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 10,
                }}
              >
                {/* Upload */}
                <SourceButton
                  icon={<Upload style={{ width: 20, height: 20 }} aria-hidden="true" />}
                  label="Upload"
                  description="Files from your device"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || isSubmitting}
                />

                {/* Text input */}
                <SourceButton
                  icon={<FileText style={{ width: 20, height: 20 }} aria-hidden="true" />}
                  label="Text input"
                  description="Paste or type text"
                  onClick={() => setView('text-input')}
                />

                {/* Google Drive */}
                <SourceButton
                  icon={<HardDrive style={{ width: 20, height: 20 }} aria-hidden="true" />}
                  label="Google Drive"
                  description="Connect in Settings"
                  badge="Settings"
                  onClick={() => handleConnectorRoute('/connectors')}
                />

                {/* Slack */}
                <SourceButton
                  icon={<MessageSquare style={{ width: 20, height: 20 }} aria-hidden="true" />}
                  label="Slack"
                  description="Connect in Settings"
                  badge="Settings"
                  onClick={() => handleConnectorRoute('/connectors')}
                />
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept={accept}
                style={{ display: 'none' }}
                onChange={handleFileInputChange}
                data-testid="add-sources-file-input"
              />

              {/* Connector note */}
              <p
                style={{
                  marginTop: 16,
                  fontSize: 11,
                  color: 'var(--agi-ink-2)',
                  textAlign: 'center',
                  lineHeight: 1.5,
                }}
              >
                Google Drive and Slack require a connector.{' '}
                <button
                  type="button"
                  onClick={() => handleConnectorRoute('/connectors')}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    fontSize: 11,
                    color: 'var(--agi-amber)',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                  }}
                >
                  Set up connectors
                  <ExternalLink style={{ width: 10, height: 10 }} aria-hidden="true" />
                </button>
              </p>
              {submitError ? (
                <p role="alert" style={{ margin: '10px 0 0', color: '#f87171', fontSize: 12 }}>
                  {submitError}
                </p>
              ) : null}
            </>
          ) : (
            <>
              <div style={{ marginBottom: 12 }}>
                <label
                  htmlFor="add-sources-text-title"
                  style={{
                    display: 'block',
                    fontSize: 12,
                    fontWeight: 500,
                    color: 'var(--agi-ink-2)',
                    marginBottom: 5,
                  }}
                >
                  Title (optional)
                </label>
                <input
                  id="add-sources-text-title"
                  type="text"
                  value={textTitle}
                  onChange={(e) => setTextTitle(e.target.value)}
                  placeholder="e.g. Project notes"
                  maxLength={120}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--agi-rule-strong)',
                    background: 'var(--agi-bg-2)',
                    color: 'var(--agi-ink)',
                    fontSize: 13,
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label
                  htmlFor="add-sources-text-content"
                  style={{
                    display: 'block',
                    fontSize: 12,
                    fontWeight: 500,
                    color: 'var(--agi-ink-2)',
                    marginBottom: 5,
                  }}
                >
                  Content
                </label>
                <textarea
                  id="add-sources-text-content"
                  ref={textInputRef}
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  placeholder="Paste or type text to add as a source..."
                  rows={8}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--agi-rule-strong)',
                    background: 'var(--agi-bg-2)',
                    color: 'var(--agi-ink)',
                    fontSize: 13,
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    outline: 'none',
                    boxSizing: 'border-box',
                    lineHeight: 1.55,
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setView('main')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 9999,
                    border: '1px solid var(--agi-rule-strong)',
                    background: 'transparent',
                    color: 'var(--agi-ink-2)',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={!textContent.trim() || isUploading || isSubmitting}
                  onClick={() => void handleTextSubmit()}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 9999,
                    border: 'none',
                    background:
                      textContent.trim() && !isUploading && !isSubmitting
                        ? 'var(--agi-amber)'
                        : 'var(--agi-bg-3)',
                    color:
                      textContent.trim() && !isUploading && !isSubmitting
                        ? 'var(--agi-bg)'
                        : 'var(--agi-ink-2)',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor:
                      textContent.trim() && !isUploading && !isSubmitting
                        ? 'pointer'
                        : 'not-allowed',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                  data-testid="add-sources-text-submit"
                >
                  {isUploading || isSubmitting ? 'Saving...' : 'Add text'}
                </button>
              </div>
              {submitError ? (
                <p role="alert" style={{ margin: '10px 0 0', color: '#f87171', fontSize: 12 }}>
                  {submitError}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface SourceButtonProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  badge?: string;
  onClick: () => void;
  disabled?: boolean;
}

function SourceButton({ icon, label, description, badge, onClick, disabled }: SourceButtonProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        padding: '14px 8px 12px',
        borderRadius: 12,
        border: `1px solid ${hovered && !disabled ? 'var(--agi-amber)' : 'var(--agi-rule-strong)'}`,
        background: hovered && !disabled ? 'rgba(200,137,42,0.05)' : 'var(--agi-bg-2)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'border-color 0.15s, background 0.15s',
        textAlign: 'center',
        width: '100%',
      }}
    >
      <span style={{ color: hovered && !disabled ? 'var(--agi-amber)' : 'var(--agi-ink-2)' }}>
        {icon}
      </span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--agi-ink)',
          lineHeight: 1.2,
        }}
      >
        {label}
      </span>
      {badge ? (
        <span
          style={{
            fontSize: 10,
            color: 'var(--agi-amber)',
            background: 'rgba(200,137,42,0.12)',
            borderRadius: 9999,
            padding: '1px 6px',
            fontWeight: 500,
          }}
        >
          {badge}
        </span>
      ) : (
        <span
          style={{
            fontSize: 10,
            color: 'var(--agi-ink-2)',
            lineHeight: 1.3,
          }}
        >
          {description}
        </span>
      )}
    </button>
  );
}
