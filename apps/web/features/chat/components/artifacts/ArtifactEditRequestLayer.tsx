'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Check, MessageSquarePlus, X } from 'lucide-react';
import type { ArtifactPickerSelection } from '@/lib/artifact-sandbox';
import { cn } from '@shared/lib/utils';
import { normalizeEditInstruction } from './artifact-edit-request';

export const SELECT_CONTENT_PROMPT = 'Select content and ask for changes';
export const CANCEL_EDIT_REQUEST = 'Cancel';
export const DESCRIBE_CHANGE_PLACEHOLDER = 'Describe the change...';
export const SEND_EDIT_REQUEST_LABEL = 'Send the change request';
export const COMMENT_ON_ELEMENT_LABEL = 'Comment on this element';
const INPUT_WIDTH_PX = 320;
const EDGE_GAP_PX = 8;
const INPUT_HEIGHT_ESTIMATE_PX = 52;

function anchoredPosition(
  rect: ArtifactPickerSelection['rect'],
  container: { width: number; height: number },
): { left: number; top: number; width: number } {
  const width = Math.min(INPUT_WIDTH_PX, Math.max(0, container.width - EDGE_GAP_PX * 2));
  const left = Math.min(
    Math.max(rect.x, EDGE_GAP_PX),
    Math.max(EDGE_GAP_PX, container.width - width - EDGE_GAP_PX),
  );
  const below = rect.y + rect.height + EDGE_GAP_PX;
  const above = rect.y - INPUT_HEIGHT_ESTIMATE_PX - EDGE_GAP_PX;
  const fitsBelow = below + INPUT_HEIGHT_ESTIMATE_PX <= container.height - EDGE_GAP_PX;
  const top = fitsBelow ? below : Math.max(EDGE_GAP_PX, above);
  return { left, top, width };
}

/**
 * ChatGPT's "Request edits" layer over the panel preview. While selection is
 * on, a pill at the bottom says what to do and offers Cancel; once the
 * sandbox reports a picked element, a one-line "Describe the change..." field
 * sits next to it with a submit check. Escape cancels from anywhere in the
 * panel; inside the artifact the sandbox reports Escape the same way.
 */
export function ArtifactEditRequestLayer({
  selection,
  onSubmit,
  onCancel,
  onComment,
}: {
  selection: ArtifactPickerSelection | null;
  onSubmit: (instruction: string) => void;
  onCancel: () => void;
  onComment?: (point: { selection: ArtifactPickerSelection; x: number; y: number }) => void;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [instruction, setInstruction] = useState('');
  const [container, setContainer] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = layerRef.current;
    if (!element) return;
    const measure = () =>
      setContainer({ width: element.clientWidth, height: element.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!selection) return;
    setInstruction('');
    inputRef.current?.focus();
  }, [selection]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onCancel]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = normalizeEditInstruction(instruction);
    if (!text) return;
    onSubmit(text);
  };

  const position = selection ? anchoredPosition(selection.rect, container) : null;

  return (
    <div
      ref={layerRef}
      className="pointer-events-none absolute inset-0 z-[var(--z-content-raised)]"
      data-testid="artifact-edit-request-layer"
    >
      {selection && position ? (
        <form
          onSubmit={submit}
          className="pointer-events-auto absolute flex items-center gap-1 rounded-xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-overlay)] p-1 shadow-e2"
          style={{ left: position.left, top: position.top, width: position.width }}
          aria-label="Request an edit to the selected element"
        >
          <label htmlFor={inputId} className="sr-only">
            {DESCRIBE_CHANGE_PLACEHOLDER}
          </label>
          <input
            ref={inputRef}
            id={inputId}
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder={DESCRIBE_CHANGE_PLACEHOLDER}
            className="min-h-11 min-w-0 flex-1 rounded-lg bg-transparent px-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9"
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={!normalizeEditInstruction(instruction)}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8 sm:w-8"
            aria-label={SEND_EDIT_REQUEST_LABEL}
            title={SEND_EDIT_REQUEST_LABEL}
          >
            <Check className="h-4 w-4" aria-hidden="true" />
          </button>
          {onComment ? (
            <button
              type="button"
              onClick={() =>
                onComment({
                  selection,
                  x:
                    container.width > 0
                      ? Math.min(100, Math.max(0, (selection.rect.x / container.width) * 100))
                      : 0,
                  y:
                    container.height > 0
                      ? Math.min(100, Math.max(0, (selection.rect.y / container.height) * 100))
                      : 0,
                })
              }
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8 sm:w-8"
              aria-label={COMMENT_ON_ELEMENT_LABEL}
              title={COMMENT_ON_ELEMENT_LABEL}
              data-testid="artifact-edit-request-comment"
            >
              <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </form>
      ) : null}
      <div
        role="status"
        className={cn(
          'pointer-events-auto absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full border border-[var(--chat-border-strong)] bg-[var(--chat-surface-overlay)] py-1 pe-1 ps-4 text-sm text-foreground shadow-e2',
        )}
        data-testid="artifact-edit-request-pill"
      >
        <span>{SELECT_CONTENT_PROMPT}</span>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          {CANCEL_EDIT_REQUEST}
        </button>
      </div>
    </div>
  );
}
