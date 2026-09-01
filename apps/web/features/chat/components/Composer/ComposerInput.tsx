'use client';

import { useCallback, useRef, useSyncExternalStore } from 'react';
import type {
  ChangeEventHandler,
  ClipboardEventHandler,
  KeyboardEventHandler,
  ReactElement,
  RefObject,
} from 'react';
import { ComposerEditor } from '@agiworkforce/unified-chat/composer-editor';
import type {
  ComposerAttachmentPasteDecision,
  ComposerEditorHandle,
  ComposerMentionConfig,
} from '@agiworkforce/unified-chat/composer-editor';
import { cn } from '@shared/lib/utils';
import {
  COMPOSER_EDITOR_MODES,
  resolveComposerEditorBuildMode,
  resolveComposerEditorMode,
  type ComposerEditorMode,
} from '@features/chat/lib/composer-editor-gate';

const MESSAGE_INPUT_LABEL = 'Message input';

/**
 * M11: the resting composer ran to ~131px at 390px against ChatGPT's ~87px, so
 * every vertical value below the `sm` breakpoint is its own step. The `sm:`
 * halves reproduce today's desktop numbers exactly — desktop is not part of
 * this slice.
 */
export const COMPOSER_INPUT_ROW_CLASS = 'min-h-[36px] py-1 sm:min-h-[52px] sm:py-3';
export const COMPOSER_INPUT_EMPTY_ROW_CLASS = 'min-h-[36px] py-1 sm:min-h-[40px] sm:py-1.5';

const INPUT_SHARED_CLASS =
  'relative z-10 max-h-[240px] w-full resize-none overflow-y-auto border-0 bg-transparent px-2 leading-relaxed text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50';
const INPUT_TEXT_SIZE_CLASS = 'text-sm md:text-[15px]';
const INPUT_EMPTY_TEXT_SIZE_CLASS = 'text-[18px] md:text-[18px]';

/**
 * The editor owns its own box through `composer-editor.css`, which is not
 * responsive — these arbitrary variants apply the same mobile step to the
 * contenteditable that the textarea gets from its own utilities.
 */
const EDITOR_SHARED_CLASS = 'relative z-10 [&_.ProseMirror]:max-h-[240px]';
const EDITOR_ROW_CLASS =
  '[&_.ProseMirror]:min-h-[36px] [&_.ProseMirror]:py-1 sm:[&_.ProseMirror]:min-h-[52px] sm:[&_.ProseMirror]:py-3';
const EDITOR_EMPTY_ROW_CLASS =
  '[&_.ProseMirror]:min-h-[36px] [&_.ProseMirror]:py-1 sm:[&_.ProseMirror]:min-h-[40px] sm:[&_.ProseMirror]:py-1.5';
const EDITOR_TEXT_SIZE_CLASS = 'md:[&_.ProseMirror]:text-[15px]';
const EDITOR_EMPTY_TEXT_SIZE_CLASS =
  '[&_.ProseMirror]:text-[18px] [&_.composer-editor\\_\\_placeholder]:text-[18px]';

export interface ComposerInputProps {
  /**
   * Owned by the parent: it focuses this node from ~7 call sites and reads
   * `scrollHeight` off it in the autosize effect, so the same ref object is
   * threaded through rather than re-created here.
   */
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  /**
   * Null for the whole life of the textarea arm. Every parent write is a
   * `setMessage` plus an optional call through this handle, so the legacy path
   * runs exactly as it does today and the editor path stays in step with the
   * mirrored `message`.
   */
  editorRef: RefObject<ComposerEditorHandle | null>;
  value: string;
  onChange: ChangeEventHandler<HTMLTextAreaElement>;
  /** The editor is uncontrolled; this is how the mirrored `message` is fed. */
  onTextChange: (value: string) => void;
  onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  onPaste: ClipboardEventHandler<HTMLTextAreaElement>;
  onPasteDecision: (decision: ComposerAttachmentPasteDecision) => void;
  onDropFiles: (files: readonly File[]) => void;
  onSubmit: () => void;
  onFocusChange: (focused: boolean) => void;
  placeholder: string | undefined;
  disabled: boolean;
  maxLength: number;
  /** New-chat surface: a larger type size and a shorter resting height. */
  emptyState: boolean;
  ariaDescribedBy: string | undefined;
  existingFileNames: readonly string[];
  mention: ComposerMentionConfig;
  isSlashMenuActive: () => boolean;
  onSlashMenuKey: (key: string) => boolean;
}

function ComposerTextarea({
  textareaRef,
  value,
  onChange,
  onKeyDown,
  onPaste,
  onFocusChange,
  placeholder,
  disabled,
  maxLength,
  emptyState,
  ariaDescribedBy,
}: ComposerInputProps) {
  return (
    <textarea
      ref={textareaRef}
      data-composer-textarea
      /* Paragraph direction follows the first strong character, so an
         Arabic or Hebrew draft aligns and edits right-to-left instead
         of being laid out as an LTR paragraph. */
      dir="auto"
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onFocus={() => onFocusChange(true)}
      onBlur={() => onFocusChange(false)}
      placeholder={placeholder}
      disabled={disabled}
      className={cn(
        INPUT_SHARED_CLASS,
        emptyState ? COMPOSER_INPUT_EMPTY_ROW_CLASS : COMPOSER_INPUT_ROW_CLASS,
        emptyState ? INPUT_EMPTY_TEXT_SIZE_CLASS : INPUT_TEXT_SIZE_CLASS,
      )}
      rows={1}
      maxLength={maxLength}
      aria-label={MESSAGE_INPUT_LABEL}
      aria-describedby={ariaDescribedBy}
    />
  );
}

function ComposerRichEditor({
  editorRef,
  value,
  onTextChange,
  onPasteDecision,
  onDropFiles,
  onSubmit,
  onFocusChange,
  placeholder,
  disabled,
  maxLength,
  emptyState,
  ariaDescribedBy,
  existingFileNames,
  mention,
  isSlashMenuActive,
  onSlashMenuKey,
}: ComposerInputProps) {
  const pendingRef = useRef(value);
  pendingRef.current = value;

  /**
   * The editor arrives two commits after the arm is chosen — the gate resolves
   * post-hydration, then `immediatelyRender: false` defers the view by another
   * commit — so a handle write issued before that lands on a null ref and is
   * lost. A draft restored on mount is the one that bites: the mirror holds it,
   * the document does not, and nothing writes again.
   *
   * A callback ref is what makes this reachable. `useImperativeHandle` keys the
   * handle on the editor, so React re-attaches here the moment the view exists,
   * which is the first point a write can actually land. The mirror is the
   * authority, so reconcile to it — and only when the document is genuinely
   * empty, so this can never clobber what someone has typed.
   */
  const attachEditor = useCallback(
    (handle: ComposerEditorHandle | null) => {
      editorRef.current = handle;
      if (!handle) return;
      const pending = pendingRef.current;
      if (pending.length > 0 && handle.isEmpty()) handle.setText(pending);
    },
    [editorRef],
  );

  return (
    <ComposerEditor
      ref={attachEditor}
      ariaLabel={MESSAGE_INPUT_LABEL}
      ariaDescribedBy={ariaDescribedBy}
      placeholder={placeholder}
      disabled={disabled}
      maxLength={maxLength}
      className={cn(
        EDITOR_SHARED_CLASS,
        emptyState ? EDITOR_EMPTY_ROW_CLASS : EDITOR_ROW_CLASS,
        emptyState ? EDITOR_EMPTY_TEXT_SIZE_CLASS : EDITOR_TEXT_SIZE_CLASS,
      )}
      existingFileNames={existingFileNames}
      mention={mention}
      onTextChange={onTextChange}
      onSubmit={onSubmit}
      onFocusChange={onFocusChange}
      onPasteDecision={onPasteDecision}
      onDropFiles={onDropFiles}
      isSlashMenuActive={isSlashMenuActive}
      onSlashMenuKey={onSlashMenuKey}
    />
  );
}

const COMPOSER_INPUT_BY_MODE: Record<
  ComposerEditorMode,
  (props: ComposerInputProps) => ReactElement
> = {
  [COMPOSER_EDITOR_MODES.textarea]: ComposerTextarea,
  [COMPOSER_EDITOR_MODES.editor]: ComposerRichEditor,
};

/**
 * The two arms render different markup, so the mode cannot be resolved during
 * render: the query and storage overrides are client-only and a server render
 * that disagreed with them would hydrate against the wrong element.
 * `getServerSnapshot` pins the first client render to the build-time default,
 * and React re-renders with the override once hydration is done.
 */
const subscribeToComposerEditorMode = () => () => {};

export function ComposerInput(props: ComposerInputProps) {
  const mode = useSyncExternalStore(
    subscribeToComposerEditorMode,
    resolveComposerEditorMode,
    resolveComposerEditorBuildMode,
  );
  const Input = COMPOSER_INPUT_BY_MODE[mode];
  return <Input {...props} />;
}
