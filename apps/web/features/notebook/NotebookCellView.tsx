'use client';

import { KeyboardEvent, useId } from 'react';
import { Play, Trash2 } from 'lucide-react';
import { Spinner } from '@agiworkforce/ui';
import { NOTEBOOK_CELL_LANGUAGES, type NotebookCellOutput } from '@agiworkforce/types';
import { sanitizeHTML } from '@shared/utils/html-sanitizer';
import type { NotebookCell } from './hooks/useNotebookCells';
import styles from './NotebookPanel.module.css';

function CellOutput({ output }: { output: NotebookCellOutput }) {
  if (output.kind === 'image') {
    return (
      <img
        className={styles['outputImage']}
        src={`data:image/png;base64,${output.data}`}
        alt="Cell output"
      />
    );
  }
  if (output.kind === 'html') {
    return (
      <div
        className={styles['outputTable']}
        // llm-guardrail-allow: a DataFrame's repr from the reader's own sandbox
        // execution, sanitized on the line below before it reaches the DOM.
        dangerouslySetInnerHTML={{ __html: sanitizeHTML(output.data, 'standard') }}
      />
    );
  }
  return (
    <pre className={output.kind === 'error' ? styles['outputError'] : styles['outputStream']}>
      {output.data}
    </pre>
  );
}

export interface NotebookCellViewProps {
  cell: NotebookCell;
  index: number;
  canRemove: boolean;
  disabled: boolean;
  registerTextarea: (cellId: string, element: HTMLTextAreaElement | null) => void;
  onChangeCode: (cellId: string, code: string) => void;
  onChangeLanguage: (cellId: string, language: NotebookCell['language']) => void;
  onRun: (cellId: string) => void;
  onRunAndAdvance: (cellId: string) => void;
  onRemove: (cellId: string) => void;
}

export function NotebookCellView({
  cell,
  index,
  canRemove,
  disabled,
  registerTextarea,
  onChangeCode,
  onChangeLanguage,
  onRun,
  onRunAndAdvance,
  onRemove,
}: NotebookCellViewProps) {
  const languageFieldId = useId();
  const codeFieldId = useId();

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter') return;
    if (event.shiftKey) {
      event.preventDefault();
      onRunAndAdvance(cell.id);
      return;
    }
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      onRun(cell.id);
    }
  }

  return (
    <div className={styles['cell']} data-cell-status={cell.status}>
      <div className={styles['cellHeader']}>
        <span className={styles['cellIndex']}>[{index + 1}]</span>
        <label className={styles['srOnly']} htmlFor={languageFieldId}>
          Cell language
        </label>
        <select
          id={languageFieldId}
          className={styles['languageSelect']}
          value={cell.language}
          disabled={disabled}
          onChange={(event) =>
            onChangeLanguage(cell.id, event.target.value as NotebookCell['language'])
          }
        >
          {NOTEBOOK_CELL_LANGUAGES.map((language) => (
            <option key={language} value={language}>
              {language}
            </option>
          ))}
        </select>
        <div className={styles['cellActions']}>
          <button
            type="button"
            className={styles['iconButton']}
            aria-label={`Run cell ${index + 1}`}
            disabled={disabled || !cell.code.trim()}
            onClick={() => onRun(cell.id)}
          >
            {cell.status === 'running' ? <Spinner size="sm" /> : <Play size={13} />}
          </button>
          {canRemove && (
            <button
              type="button"
              className={styles['iconButton']}
              aria-label={`Delete cell ${index + 1}`}
              disabled={disabled}
              onClick={() => onRemove(cell.id)}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
      <label className={styles['srOnly']} htmlFor={codeFieldId}>
        Cell {index + 1} code
      </label>
      <textarea
        id={codeFieldId}
        ref={(element) => registerTextarea(cell.id, element)}
        className={styles['cellCode']}
        value={cell.code}
        disabled={disabled}
        spellCheck={false}
        placeholder="Shift+Enter to run and add a cell, Cmd/Ctrl+Enter to run in place"
        onChange={(event) => onChangeCode(cell.id, event.target.value)}
        onKeyDown={handleKeyDown}
      />
      {cell.outputs.length > 0 && (
        <div className={styles['cellOutputs']} aria-live="polite">
          {cell.outputs.map((output, outputIndex) => (
            <CellOutput key={`${cell.id}-${outputIndex}`} output={output} />
          ))}
        </div>
      )}
    </div>
  );
}
