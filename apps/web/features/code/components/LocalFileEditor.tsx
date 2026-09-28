'use client';

import { useEffect, useId, useState } from 'react';
import { X } from '@agiworkforce/icons';
import { Spinner } from '@agiworkforce/ui';
import { readWorkspaceText, writeWorkspaceText } from '@/features/desktop-host';
import { toUserMessage } from '@/lib/user-error-message';
import { LOCAL_CODE_COPY } from '../local-code';
import styles from '../CloudCodePage.module.css';

const GLYPH_SIZE = 15;

export interface LocalFileEditorProps {
  rootId: string;
  path: string;
  onSaved: () => void;
  onClose: () => void;
}

export function LocalFileEditor({ rootId, path, onSaved, onClose }: LocalFileEditorProps) {
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setError(null);
    readWorkspaceText(rootId, path)
      .then((file) => {
        if (cancelled) return;
        setText(file.text);
        setSaved(file.text);
        setTruncated(file.truncated);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(toUserMessage(cause, LOCAL_CODE_COPY.fileReadFailed));
      });
    return () => {
      cancelled = true;
    };
  }, [rootId, path]);

  const save = async () => {
    if (text === null || truncated) return;
    setSaving(true);
    setError(null);
    try {
      await writeWorkspaceText(rootId, path, text);
      setSaved(text);
      onSaved();
    } catch (cause: unknown) {
      setError(toUserMessage(cause, LOCAL_CODE_COPY.fileSaveFailed));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles['fileEditor']}>
      <div className={styles['fileEditorHeader']}>
        <label className={styles['fileName']} htmlFor={fieldId}>
          {path}
        </label>
        <button
          type="button"
          className={styles['headerButton']}
          aria-label={LOCAL_CODE_COPY.closeFile}
          onClick={onClose}
        >
          <X size={GLYPH_SIZE} aria-hidden="true" />
        </button>
      </div>

      {error !== null && (
        <span className={styles['formHelp']} role="alert">
          {error}
        </span>
      )}

      {text === null && error === null && (
        <Spinner size="sm" aria-label={LOCAL_CODE_COPY.openingFile} />
      )}

      {text !== null && (
        <>
          <textarea
            id={fieldId}
            className={styles['fileEditorInput']}
            value={text}
            spellCheck={false}
            readOnly={truncated}
            onChange={(event) => setText(event.target.value)}
          />
          {truncated && <span className={styles['formHelp']}>{LOCAL_CODE_COPY.fileTooLarge}</span>}
          <div className={styles['popoverActions']}>
            <button
              type="button"
              className={styles['primaryButton']}
              disabled={saving || truncated || text === saved}
              onClick={() => void save()}
            >
              {saving && <Spinner size="sm" aria-hidden="true" />}
              {LOCAL_CODE_COPY.saveFile}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
