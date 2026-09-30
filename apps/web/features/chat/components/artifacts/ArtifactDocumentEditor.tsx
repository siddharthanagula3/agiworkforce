'use client';

import { useMemo, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { Markdown } from '@tiptap/markdown';

import { ArtifactCodeEditor, type CodeEditorWrap } from './ArtifactCodeEditor';
import {
  createDocumentMarkdownManager,
  documentEditorExtensions,
  roundTripsAsDocument,
} from './document-editor-markdown';

export interface ArtifactDocumentEditorProps {
  value: string;
  onChange: (value: string) => void;
  wraps: Readonly<Record<string, CodeEditorWrap>>;
}

const SOURCE_ONLY_NOTICE =
  'This document uses formatting the document editor cannot keep, such as math, footnotes or raw HTML, so it opens as Markdown.';

function RichDocumentEditor({ value, onChange }: Omit<ArtifactDocumentEditorProps, 'wraps'>) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const editor = useEditor({
    extensions: [...documentEditorExtensions(), Markdown],
    content: value,
    contentType: 'markdown',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        'aria-label': 'Document',
        'aria-multiline': 'true',
        role: 'textbox',
        class: 'artifact-document-editor__content',
      },
    },
    onUpdate: ({ editor: current }) => onChangeRef.current(current.getMarkdown()),
  });

  return (
    <div
      className="artifact-document-editor h-full w-full overflow-auto bg-background px-6 py-5"
      data-testid="artifact-document-editor"
    >
      <EditorContent editor={editor} className="mx-auto max-w-3xl" />
    </div>
  );
}

export function ArtifactDocumentEditor({ value, onChange, wraps }: ArtifactDocumentEditorProps) {
  const initialValue = useRef(value).current;
  const editable = useMemo(
    () => roundTripsAsDocument(initialValue, createDocumentMarkdownManager()),
    [initialValue],
  );

  if (editable) return <RichDocumentEditor value={initialValue} onChange={onChange} />;
  return (
    <div className="flex h-full w-full flex-col">
      <p
        className="shrink-0 border-b border-border/30 px-4 py-2 text-xs text-muted-foreground"
        role="status"
      >
        {SOURCE_ONLY_NOTICE}
      </p>
      <div className="min-h-0 flex-1">
        <ArtifactCodeEditor
          value={value}
          onChange={onChange}
          language="markdown"
          wraps={wraps}
          ariaLabel="Artifact source"
        />
      </div>
    </div>
  );
}
