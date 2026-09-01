'use client';

import type {
  ChangeEventHandler,
  ClipboardEventHandler,
  FocusEventHandler,
  KeyboardEventHandler,
  ReactElement,
  RefObject,
} from 'react';
import { cn } from '@shared/lib/utils';
import {
  COMPOSER_EDITOR_MODES,
  resolveComposerEditorMode,
  type ComposerEditorMode,
} from '@features/chat/lib/composer-editor-gate';

const MESSAGE_INPUT_LABEL = 'Message input';

export interface ComposerInputProps {
  /**
   * Owned by the parent: it focuses this node from ~7 call sites and reads
   * `scrollHeight` off it in the autosize effect, so the same ref object is
   * threaded through rather than re-created here.
   */
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: ChangeEventHandler<HTMLTextAreaElement>;
  onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  onPaste: ClipboardEventHandler<HTMLTextAreaElement>;
  onFocus: FocusEventHandler<HTMLTextAreaElement>;
  onBlur: FocusEventHandler<HTMLTextAreaElement>;
  placeholder: string | undefined;
  disabled: boolean;
  maxLength: number;
  /** New-chat surface: a larger type size and a shorter resting height. */
  emptyState: boolean;
  ariaDescribedBy: string | undefined;
}

function ComposerTextarea({
  textareaRef,
  value,
  onChange,
  onKeyDown,
  onPaste,
  onFocus,
  onBlur,
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
      onFocus={onFocus}
      onBlur={onBlur}
      placeholder={placeholder}
      disabled={disabled}
      className={cn(
        'relative z-10 max-h-[240px] w-full resize-none overflow-y-auto border-0 bg-transparent px-2 leading-relaxed text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
        emptyState
          ? 'min-h-[40px] py-1.5 text-[18px] md:text-[18px]'
          : 'min-h-[52px] py-3 text-sm md:text-[15px]',
      )}
      rows={1}
      maxLength={maxLength}
      aria-label={MESSAGE_INPUT_LABEL}
      aria-describedby={ariaDescribedBy}
    />
  );
}

/**
 * Both arms are the legacy textarea until the rich editor lands; the gate is
 * wired now so the e2e `?composer=` switch and the storage override exist
 * before there is anything to switch between.
 *
 * The editor arm must resolve its mode after mount rather than during render —
 * the query and storage overrides are client-only, so a server render that
 * disagreed with them would hydrate against different markup. That cannot bite
 * while both arms produce identical output.
 */
const COMPOSER_INPUT_BY_MODE: Record<
  ComposerEditorMode,
  (props: ComposerInputProps) => ReactElement
> = {
  [COMPOSER_EDITOR_MODES.textarea]: ComposerTextarea,
  [COMPOSER_EDITOR_MODES.editor]: ComposerTextarea,
};

export function ComposerInput(props: ComposerInputProps) {
  const Input = COMPOSER_INPUT_BY_MODE[resolveComposerEditorMode()];
  return <Input {...props} />;
}
