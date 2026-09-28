'use client';

import { useState } from 'react';
import { Brain } from '@agiworkforce/icons';
import {
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  RadioGroup,
  RadioGroupItem,
  Spinner,
} from '@agiworkforce/ui';
import { addDeveloperMemory } from '@/features/desktop-host';
import { toUserMessage } from '@/lib/user-error-message';
import { LOCAL_CODE_COPY } from '../local-code';
import styles from '../CloudCodePage.module.css';

const GLYPH_SIZE = 16;
const POPOVER_WIDTH = 360;
const MEMORY_ROWS = 4;

type MemoryDestination = 'project' | 'user';

const DESTINATIONS: ReadonlyArray<{ id: MemoryDestination; label: string; hint: string }> = [
  {
    id: 'project',
    label: LOCAL_CODE_COPY.memoryProject,
    hint: LOCAL_CODE_COPY.memoryProjectHint,
  },
  { id: 'user', label: LOCAL_CODE_COPY.memoryUser, hint: LOCAL_CODE_COPY.memoryUserHint },
];

export function LocalMemoryControl({ rootId }: { rootId: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [destination, setDestination] = useState<MemoryDestination>('project');
  const [saving, setSaving] = useState(false);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const memory = text.trim();
    if (memory === '' || saving) return;
    setSaving(true);
    setError(null);
    setSavedPath(null);
    try {
      const saved = await addDeveloperMemory(rootId, memory, destination);
      setSavedPath(saved.path);
      setText('');
    } catch (cause: unknown) {
      setError(toUserMessage(cause, LOCAL_CODE_COPY.memoryFailed));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setError(null);
          setSavedPath(null);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`${styles['headerButton']} ${open ? styles['headerButtonActive'] : ''}`}
          aria-label={LOCAL_CODE_COPY.memory}
          title={LOCAL_CODE_COPY.memory}
        >
          <Brain size={GLYPH_SIZE} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        style={{ width: POPOVER_WIDTH }}
        className="p-0"
        aria-label={LOCAL_CODE_COPY.memory}
      >
        <form
          className={styles['popover']}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <span className={styles['popoverHeading']}>{LOCAL_CODE_COPY.memoryHeading}</span>
          <label className={styles['formField']}>
            <span className={styles['formLabel']}>{LOCAL_CODE_COPY.memoryLabel}</span>
            <textarea
              className={`${styles['textInput']} ${styles['memoryInput']}`}
              rows={MEMORY_ROWS}
              value={text}
              placeholder={LOCAL_CODE_COPY.memoryPlaceholder}
              disabled={saving}
              onChange={(event) => setText(event.target.value)}
            />
          </label>
          <RadioGroup
            value={destination}
            onValueChange={(value) => setDestination(value === 'user' ? 'user' : 'project')}
            disabled={saving}
          >
            {DESTINATIONS.map((option) => (
              <Label
                key={option.id}
                htmlFor={`local-memory-${option.id}`}
                className={styles['shareOption']}
              >
                <RadioGroupItem id={`local-memory-${option.id}`} value={option.id} />
                <span className={styles['menuRowLabel']}>
                  <span className={styles['optionLabel']}>{option.label}</span>
                  <span className={styles['optionHint']}>{option.hint}</span>
                </span>
              </Label>
            ))}
          </RadioGroup>
          {error !== null && (
            <span className={styles['formHelp']} role="alert">
              {error}
            </span>
          )}
          {savedPath !== null && (
            <span className={styles['formHelp']} role="status">
              {`${LOCAL_CODE_COPY.memorySavedTo} ${savedPath}`}
            </span>
          )}
          <button
            type="submit"
            className={styles['primaryButton']}
            disabled={saving || text.trim() === ''}
          >
            {saving && <Spinner size="sm" aria-label={LOCAL_CODE_COPY.memorySaving} />}
            {LOCAL_CODE_COPY.memorySave}
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
