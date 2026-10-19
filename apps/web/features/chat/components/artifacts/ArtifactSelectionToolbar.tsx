'use client';

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from 'react';
import { Check, ChevronDown, MessageSquarePlus, Sparkles, Wand2, X } from 'lucide-react';
import { useMenuKeyboard } from '@agiworkforce/ui';
import { cn } from '@shared/lib/utils';
import { normalizeEditInstruction } from './artifact-edit-request';
import { SELECTION_ACTIONS } from './artifact-selection-request';

export const SELECTION_TOOLBAR_LABEL = 'Selection actions';
export const EDIT_SELECTION_LABEL = 'Edit with AI';
export const IMPROVE_SELECTION_LABEL = 'Improve';
export const COMMENT_SELECTION_LABEL = 'Comment';
export const DESCRIBE_SELECTION_CHANGE = 'Describe the change...';
export const SEND_SELECTION_CHANGE = 'Send the change request';

const TOOLBAR_HEIGHT_PX = 44;
const EDGE_GAP_PX = 8;
const ASK_WIDTH_PX = 320;
const TOOLBAR_HALF_WIDTH_PX = 160;

interface Anchor {
  text: string;
  origin: Node;
  left: number;
  top: number;
  below: boolean;
}

function readAnchor(container: HTMLElement): Anchor | null {
  const selection = typeof window === 'undefined' ? null : window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;
  const text = selection.toString().trim();
  if (!text) return null;
  const box = container.getBoundingClientRect();
  const rect =
    typeof range.getBoundingClientRect === 'function'
      ? range.getBoundingClientRect()
      : { left: box.left, top: box.top, width: 0, height: 0, bottom: box.top };
  const below = rect.top - box.top < TOOLBAR_HEIGHT_PX + EDGE_GAP_PX;
  return {
    text,
    origin: range.commonAncestorContainer,
    left: rect.left - box.left + rect.width / 2,
    top: below ? rect.bottom - box.top + EDGE_GAP_PX : rect.top - box.top - EDGE_GAP_PX,
    below,
  };
}

function ImproveMenu({
  onPick,
  onOpenChange,
}: {
  onPick: (instruction: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const setMenuOpen = useCallback(
    (next: boolean) => {
      setOpen(next);
      onOpenChange(next);
    },
    [onOpenChange],
  );
  const close = useCallback(() => setMenuOpen(false), [setMenuOpen]);
  useMenuKeyboard({ open, onClose: close, panelRef, triggerRef });

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setMenuOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2.5 text-sm text-foreground transition-colors hover:bg-[var(--chat-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8"
        data-testid="selection-improve"
      >
        <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
        {IMPROVE_SELECTION_LABEL}
        <ChevronDown className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
      </button>
      {open ? (
        <div
          ref={panelRef}
          id={menuId}
          role="menu"
          aria-label={IMPROVE_SELECTION_LABEL}
          className="absolute start-0 top-full z-[var(--z-dropdown)] mt-1 max-h-72 w-56 overflow-y-auto rounded-xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-overlay)] p-1 shadow-e2"
        >
          {SELECTION_ACTIONS.map((action, index) => (
            <Fragment key={action.id}>
              {action.group !== SELECTION_ACTIONS[index - 1]?.group ? (
                <div
                  role="presentation"
                  className={cn(
                    'px-2.5 pb-1 pt-2 text-xs font-medium text-muted-foreground',
                    index > 0 && 'mt-1 border-t border-[var(--chat-border)]',
                  )}
                >
                  {action.group}
                </div>
              ) : null}
              <button
                type="button"
                role="menuitem"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setMenuOpen(false);
                  onPick(action.instruction);
                }}
                className="flex min-h-11 w-full items-center rounded-lg px-2.5 text-start text-sm text-foreground hover:bg-[var(--chat-surface-hover)] focus-visible:bg-[var(--chat-surface-hover)] focus-visible:outline-none sm:min-h-9"
                data-testid={`selection-action-${action.id}`}
              >
                {action.label}
              </button>
            </Fragment>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ArtifactSelectionToolbar({
  containerRef,
  onRequest,
  onComment,
}: {
  containerRef: RefObject<HTMLElement | null>;
  onRequest: (selectedText: string, instruction: string, origin: Node) => boolean;
  onComment?: (selectedText: string, origin: Node) => void;
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [asking, setAsking] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [width, setWidth] = useState(0);
  const holdRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const refresh = useCallback(() => {
    if (holdRef.current) return;
    const container = containerRef.current;
    setAnchor(container ? readAnchor(container) : null);
    if (container) setWidth(container.clientWidth);
  }, [containerRef]);

  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(refresh);
    };
    document.addEventListener('selectionchange', schedule);
    document.addEventListener('scroll', schedule, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('selectionchange', schedule);
      document.removeEventListener('scroll', schedule, true);
    };
  }, [refresh]);

  useLayoutEffect(() => {
    if (asking) inputRef.current?.focus();
  }, [asking]);

  const dismiss = useCallback(() => {
    holdRef.current = false;
    setAsking(false);
    setInstruction('');
    setAnchor(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  useEffect(() => {
    if (!anchor) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      dismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [anchor, dismiss]);

  const send = useCallback(
    (text: string) => {
      if (!anchor) return;
      const normalized = normalizeEditInstruction(text);
      if (!normalized) return;
      if (onRequest(anchor.text, normalized, anchor.origin)) dismiss();
    },
    [anchor, dismiss, onRequest],
  );

  if (!anchor) return null;

  const toolbarWidth = asking ? Math.min(ASK_WIDTH_PX, Math.max(0, width - EDGE_GAP_PX * 2)) : 0;
  const left = asking
    ? Math.min(
        Math.max(anchor.left - toolbarWidth / 2, EDGE_GAP_PX),
        Math.max(EDGE_GAP_PX, width - toolbarWidth - EDGE_GAP_PX),
      )
    : Math.min(
        Math.max(anchor.left, TOOLBAR_HALF_WIDTH_PX),
        Math.max(TOOLBAR_HALF_WIDTH_PX, width - TOOLBAR_HALF_WIDTH_PX),
      );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    send(instruction);
  };

  return (
    <div
      className={cn(
        'pointer-events-auto absolute z-[var(--z-content-raised)]',
        anchor.below ? '' : '-translate-y-full',
        asking ? '' : '-translate-x-1/2',
      )}
      style={{ left, top: anchor.top, ...(asking ? { width: toolbarWidth } : {}) }}
      data-testid="artifact-selection-toolbar"
    >
      {asking ? (
        <form
          onSubmit={submit}
          className="flex items-center gap-1 rounded-xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-overlay)] p-1 shadow-e2"
          aria-label={EDIT_SELECTION_LABEL}
        >
          <label htmlFor={inputId} className="sr-only">
            {DESCRIBE_SELECTION_CHANGE}
          </label>
          <input
            ref={inputRef}
            id={inputId}
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                dismiss();
              }
            }}
            placeholder={DESCRIBE_SELECTION_CHANGE}
            autoComplete="off"
            className="min-h-11 min-w-0 flex-1 rounded-lg bg-transparent px-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9"
          />
          <button
            type="submit"
            disabled={!normalizeEditInstruction(instruction)}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8 sm:w-8"
            aria-label={SEND_SELECTION_CHANGE}
            title={SEND_SELECTION_CHANGE}
          >
            <Check className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-[var(--chat-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8 sm:w-8"
            aria-label="Cancel"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>
      ) : (
        <div
          role="toolbar"
          aria-label={SELECTION_TOOLBAR_LABEL}
          className="flex items-center gap-0.5 whitespace-nowrap rounded-xl border border-[var(--chat-border-strong)] bg-[var(--chat-surface-overlay)] p-1 shadow-e2"
        >
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              holdRef.current = true;
              setAsking(true);
            }}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-sm text-foreground transition-colors hover:bg-[var(--chat-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8"
            data-testid="selection-edit-with-ai"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {EDIT_SELECTION_LABEL}
          </button>
          <ImproveMenu
            onPick={send}
            onOpenChange={(open) => {
              holdRef.current = open;
            }}
          />
          {onComment ? (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const { text, origin } = anchor;
                dismiss();
                onComment(text, origin);
              }}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-sm text-foreground transition-colors hover:bg-[var(--chat-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8"
              data-testid="selection-comment"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
              {COMMENT_SELECTION_LABEL}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
