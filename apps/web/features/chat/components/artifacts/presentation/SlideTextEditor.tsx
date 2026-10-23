'use client';

import { useMemo, useRef, type ReactNode } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { Markdown } from '@tiptap/markdown';
import { cn } from '@shared/lib/utils';
import { ArtifactCodeEditor } from '../ArtifactCodeEditor';
import { DocumentFormattingToolbar } from '../DocumentFormattingToolbar';
import {
  createDocumentMarkdownManager,
  documentEditorExtensions,
  roundTripsAsDocument,
} from '../document-editor-markdown';
import { deckThemeStyle } from './SlideView';
import type { DeckTheme } from './deck-themes';
import styles from './Deck.module.css';

function RichSlideEditor({
  value,
  onChange,
  theme,
  index,
  overlay,
}: {
  value: string;
  onChange: (value: string) => void;
  theme: DeckTheme;
  index: number;
  overlay?: ReactNode;
}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const editor = useEditor({
    extensions: [...documentEditorExtensions(), Markdown],
    content: value,
    contentType: 'markdown',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        'aria-label': `Slide ${index + 1} text`,
        'aria-multiline': 'true',
        role: 'textbox',
      },
    },
    onUpdate: ({ editor: current }) => onChangeRef.current(current.getMarkdown()),
  });

  return (
    <div className="flex flex-col gap-2">
      {editor ? <DocumentFormattingToolbar editor={editor} /> : null}
      <div
        className={cn(
          styles['slide'],
          'focus-within:ring-2 focus-within:ring-inset focus-within:ring-focus-ring',
        )}
        style={deckThemeStyle(theme)}
        data-testid="deck-slide-editor"
      >
        <div className={styles['body']}>
          <EditorContent editor={editor} className="outline-none [&_.ProseMirror]:outline-none" />
        </div>
        {overlay}
      </div>
    </div>
  );
}

export function SlideTextEditor({
  value,
  onChange,
  theme,
  index,
  overlay,
}: {
  value: string;
  onChange: (value: string) => void;
  theme: DeckTheme;
  index: number;
  overlay?: ReactNode;
}) {
  const initial = useRef(value).current;
  const rich = useMemo(
    () => roundTripsAsDocument(initial, createDocumentMarkdownManager()),
    [initial],
  );
  if (rich) {
    return (
      <RichSlideEditor
        value={initial}
        onChange={onChange}
        theme={theme}
        index={index}
        {...(overlay ? { overlay } : {})}
      />
    );
  }
  return (
    <div className="h-64 overflow-hidden rounded-lg border border-border/40">
      <ArtifactCodeEditor
        value={value}
        onChange={onChange}
        language="markdown"
        ariaLabel={`Slide ${index + 1} source`}
      />
    </div>
  );
}
