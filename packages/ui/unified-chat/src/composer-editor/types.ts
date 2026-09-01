import type { ComposerPasteDecision } from '../lib/largePaste';

export type ComposerSendShortcut = 'enter' | 'mod-enter';

export type ComposerCaretPosition = 'start' | 'end';

export type ComposerAttachmentPasteDecision = Exclude<ComposerPasteDecision, { kind: 'text' }>;

export interface ComposerMentionAttributes {
  id: string;
  label?: string | null;
}

export interface ComposerMentionCommit {
  insertMention: (attributes: ComposerMentionAttributes) => void;
  removeQuery: () => void;
}

export interface ComposerMentionMenuState {
  query: string;
  commit: ComposerMentionCommit;
}

export interface ComposerMentionMenuAdapter {
  onOpen?: (state: ComposerMentionMenuState) => void;
  onUpdate?: (state: ComposerMentionMenuState) => void;
  onClose?: () => void;
  onKeyDown?: (event: KeyboardEvent) => boolean;
}

export interface ComposerMentionConfig {
  menu: ComposerMentionMenuAdapter;
  renderText?: (attributes: ComposerMentionAttributes) => string;
}

export interface ComposerEditorHandle {
  setText: (text: string, caret?: ComposerCaretPosition) => void;
  insertText: (text: string) => void;
  appendText: (text: string) => void;
  clear: () => void;
  focus: (caret?: ComposerCaretPosition) => void;
  getText: () => string;
  isEmpty: () => boolean;
}

export interface ComposerEditorProps {
  ariaLabel: string;
  ariaDescribedBy?: string;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  sendShortcut?: ComposerSendShortcut;
  className?: string;
  existingFileNames?: readonly string[];
  mention?: ComposerMentionConfig;
  onTextChange?: (text: string) => void;
  onSubmit?: () => void;
  onFocusChange?: (focused: boolean) => void;
  onPasteDecision?: (decision: ComposerAttachmentPasteDecision) => void;
  onDropFiles?: (files: readonly File[]) => void;
  isSlashMenuActive?: () => boolean;
  onSlashMenuKey?: (key: string) => boolean;
}
