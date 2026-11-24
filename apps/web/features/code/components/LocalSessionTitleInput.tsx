'use client';

import { useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { isImeComposingKey } from '@agiworkforce/unified-chat/ime-composition';
import { LOCAL_CODE_COPY } from '../local-code';
import styles from '../CloudCodePage.module.css';

export function LocalSessionTitleInput({
  title,
  formClassName,
  inputClassName,
  onSave,
  onFinish,
}: {
  title: string;
  formClassName: string | undefined;
  inputClassName: string | undefined;
  onSave: (title: string) => Promise<string | null>;
  onFinish: (restoreFocus: boolean) => void;
}) {
  const [draft, setDraft] = useState(title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const settled = useRef(false);
  const pending = useRef(false);
  const mounted = useRef(false);
  const errorId = useId();

  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const finish = () => {
    settled.current = true;
    onFinish(document.activeElement === input.current);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (settled.current || pending.current) return;
    const nextTitle = draft.trim();
    if (nextTitle === '' || nextTitle === title) {
      finish();
      return;
    }
    pending.current = true;
    setSaving(true);
    setError(null);
    try {
      const failure = await onSave(nextTitle);
      if (!mounted.current) return;
      if (failure === null) finish();
      else setError(failure);
    } catch {
      if (mounted.current) setError(LOCAL_CODE_COPY.renameFailed);
    } finally {
      pending.current = false;
      if (mounted.current && !settled.current) setSaving(false);
    }
  };

  return (
    <form
      className={`${formClassName ?? ''} ${styles['sessionTitleEdit']}`}
      aria-busy={saving || undefined}
      onSubmit={submit}
    >
      <input
        ref={input}
        aria-label={LOCAL_CODE_COPY.sessionName}
        aria-describedby={error === null ? undefined : errorId}
        aria-invalid={error !== null || undefined}
        className={inputClassName}
        value={draft}
        readOnly={saving}
        autoFocus
        maxLength={200}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
        onBlur={(event) => {
          if (error === null) void submit(event);
        }}
        onKeyDown={(event) => {
          if (isImeComposingKey(event.nativeEvent) || event.key !== 'Escape') return;
          event.preventDefault();
          event.stopPropagation();
          if (!pending.current) finish();
        }}
      />
      {error !== null && (
        <p id={errorId} className={styles['formHelp']} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
