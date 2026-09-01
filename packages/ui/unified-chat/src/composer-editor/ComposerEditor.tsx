import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { Fragment, Slice } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/core';
import { cn } from '../lib/utils';
import { decideComposerPaste, filesFromDataTransfer } from '../lib/largePaste';
import { createComposerExtensions } from './extensions';
import { COMPOSER_PROGRAMMATIC_META } from './extensions/max-length';
import { SEND_ON_ENTER } from './extensions/submit-keymap';
import {
  COMPOSER_BLOCK_SEPARATOR,
  COMPOSER_PARAGRAPH_NODE_NAME,
  composerText,
  textToComposerDocument,
} from './serialization';
import type {
  ComposerCaretPosition,
  ComposerEditorHandle,
  ComposerEditorProps,
  ComposerSendShortcut,
} from './types';

export const COMPOSER_EDITOR_ATTRIBUTE = 'data-composer-textarea';
export const COMPOSER_EDITOR_ROOT_CLASS = 'composer-editor';
export const COMPOSER_EDITOR_CONTENT_CLASS = 'composer-editor__content';
export const COMPOSER_EDITOR_PLACEHOLDER_CLASS = 'composer-editor__placeholder';
export const COMPOSER_EDITOR_DISABLED_CLASS = 'composer-editor--disabled';

const TEXTBOX_ROLE = 'textbox';
const MULTILINE = 'true';
const AUTO_DIRECTION = 'auto';
const EMPTY_ATTRIBUTE_VALUE = '';
const EMPTY_TEXT = '';
const DEFAULT_SEND_SHORTCUT: ComposerSendShortcut = SEND_ON_ENTER;
const DEFAULT_CARET: ComposerCaretPosition = 'end';
const CARET_START: ComposerCaretPosition = 'start';
const TEXT_PASTE = 'text';

function resetComposerHistory(editor: Editor): void {
  const { state, view } = editor;
  view.updateState(
    EditorState.create({
      doc: state.doc,
      selection: state.selection,
      storedMarks: state.storedMarks,
      plugins: state.plugins,
    }),
  );
}

function insertPlainText(editor: Editor, text: string): void {
  if (text.length === 0) return;
  const { state, view } = editor;
  const { schema } = state;
  const paragraphs = text
    .split(COMPOSER_BLOCK_SEPARATOR)
    .map((line) =>
      schema.node(
        COMPOSER_PARAGRAPH_NODE_NAME,
        null,
        line.length > 0 ? schema.text(line) : undefined,
      ),
    );
  view.dispatch(state.tr.replaceSelection(new Slice(Fragment.from(paragraphs), 1, 1)));
}

function selectCaret(editor: Editor, caret: ComposerCaretPosition): boolean {
  return editor.commands.command(({ tr, dispatch }) => {
    dispatch?.(
      tr.setSelection(
        caret === CARET_START ? TextSelection.atStart(tr.doc) : TextSelection.atEnd(tr.doc),
      ),
    );
    return true;
  });
}

export const ComposerEditor = forwardRef<ComposerEditorHandle, ComposerEditorProps>(
  function ComposerEditor(props, ref) {
    const propsRef = useRef(props);
    propsRef.current = props;

    const [isEmpty, setIsEmpty] = useState(true);

    const { ariaLabel, ariaDescribedBy, placeholder, disabled = false, className } = props;

    const extensions = useMemo(
      () =>
        createComposerExtensions({
          resolveMention: () => propsRef.current.mention,
          resolveLimit: () => propsRef.current.maxLength ?? null,
          resolveSendShortcut: () => propsRef.current.sendShortcut ?? DEFAULT_SEND_SHORTCUT,
          onSubmit: () => propsRef.current.onSubmit?.(),
          isMenuActive: () => propsRef.current.isSlashMenuActive?.() ?? false,
          onMenuKey: (key) => propsRef.current.onSlashMenuKey?.(key) ?? false,
        }),
      [],
    );

    const attributes = useMemo(
      () => ({
        role: TEXTBOX_ROLE,
        'aria-multiline': MULTILINE,
        'aria-label': ariaLabel,
        ...(ariaDescribedBy ? { 'aria-describedby': ariaDescribedBy } : {}),
        dir: AUTO_DIRECTION,
        [COMPOSER_EDITOR_ATTRIBUTE]: EMPTY_ATTRIBUTE_VALUE,
        class: COMPOSER_EDITOR_CONTENT_CLASS,
      }),
      [ariaLabel, ariaDescribedBy],
    );

    const editorProps = useMemo(
      () => ({
        attributes,
        handlePaste: (_view: unknown, event: ClipboardEvent) => {
          const current = propsRef.current;
          const decision = decideComposerPaste(event.clipboardData, {
            existingFileNames: current.existingFileNames ?? [],
          });
          if (decision.kind === TEXT_PASTE) return false;
          current.onPasteDecision?.(decision);
          return true;
        },
        handleDrop: (_view: unknown, event: DragEvent) => {
          const files = filesFromDataTransfer(event.dataTransfer);
          if (files.length === 0) return false;
          propsRef.current.onDropFiles?.(files);
          return true;
        },
      }),
      [attributes],
    );

    const editor = useEditor(
      {
        extensions,
        editorProps,
        immediatelyRender: false,
        editable: !disabled,
        onCreate: ({ editor: instance }) => setIsEmpty(instance.isEmpty),
        onUpdate: ({ editor: instance }) => {
          setIsEmpty(instance.isEmpty);
          propsRef.current.onTextChange?.(composerText(instance));
        },
        onFocus: () => propsRef.current.onFocusChange?.(true),
        onBlur: () => propsRef.current.onFocusChange?.(false),
      },
      [],
    );

    useEffect(() => {
      if (editor && editor.isEditable !== !disabled) editor.setEditable(!disabled);
    }, [editor, disabled]);

    useImperativeHandle(
      ref,
      (): ComposerEditorHandle => ({
        setText: (text, caret = DEFAULT_CARET) => {
          if (!editor) return;
          editor
            .chain()
            .setMeta(COMPOSER_PROGRAMMATIC_META, true)
            .setContent(textToComposerDocument(text))
            .run();
          selectCaret(editor, caret);
          resetComposerHistory(editor);
        },
        insertText: (text) => {
          if (editor) insertPlainText(editor, text);
        },
        appendText: (text) => {
          if (!editor) return;
          selectCaret(editor, DEFAULT_CARET);
          insertPlainText(editor, text);
        },
        clear: () => {
          if (!editor) return;
          editor.chain().setMeta(COMPOSER_PROGRAMMATIC_META, true).clearContent(true).run();
          resetComposerHistory(editor);
        },
        focus: (caret = DEFAULT_CARET) => editor?.commands.focus(caret),
        getText: () => (editor ? composerText(editor) : EMPTY_TEXT),
        isEmpty: () => editor?.isEmpty ?? true,
      }),
      [editor],
    );

    return (
      <div
        className={cn(
          COMPOSER_EDITOR_ROOT_CLASS,
          disabled && COMPOSER_EDITOR_DISABLED_CLASS,
          className,
        )}
      >
        {placeholder && isEmpty ? (
          <div className={COMPOSER_EDITOR_PLACEHOLDER_CLASS} aria-hidden>
            {placeholder}
          </div>
        ) : null}
        <EditorContent editor={editor} />
      </div>
    );
  },
);
