'use client';

import { useEffect, useRef } from 'react';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  LanguageDescription,
  syntaxHighlighting,
} from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  keymap,
  lineNumbers,
  type KeyBinding,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';

export interface CodeEditorWrap {
  before: string;
  after: string;
  placeholder: string;
}

export interface ArtifactCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string | undefined;
  wraps?: Readonly<Record<string, CodeEditorWrap>> | undefined;
  ariaLabel: string;
}

const syntaxStyle = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.operatorKeyword, tags.modifier, tags.controlKeyword],
    color: 'var(--chat-code-syntax-keyword)',
  },
  {
    tag: [tags.string, tags.special(tags.string), tags.regexp, tags.url],
    color: 'var(--chat-code-syntax-string)',
  },
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment, tags.meta],
    color: 'var(--chat-code-syntax-comment)',
  },
  {
    tag: [tags.number, tags.bool, tags.null, tags.atom, tags.literal],
    color: 'var(--chat-code-syntax-number)',
  },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.macroName],
    color: 'var(--chat-code-syntax-function)',
  },
  {
    tag: [tags.typeName, tags.className, tags.tagName, tags.namespace, tags.attributeName],
    color: 'var(--chat-code-syntax-type)',
  },
  { tag: tags.heading, fontWeight: '600', color: 'var(--chat-code-syntax-keyword)' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: '600' },
  { tag: tags.link, color: 'var(--chat-code-syntax-string)', textDecoration: 'underline' },
]);

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--chat-code-text)',
    backgroundColor: 'var(--chat-code-bg)',
    fontSize: '0.875rem',
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.5rem',
  },
  '.cm-content': { caretColor: 'var(--chat-code-text)', padding: '1rem 0' },
  '.cm-gutters': {
    backgroundColor: 'var(--chat-code-bg)',
    color: 'var(--chat-code-lang-label)',
    border: 'none',
  },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--chat-code-copy-hover-bg)' },
  '&.cm-focused': { outline: 'none' },
  '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--chat-code-text)' },
});

function wrapBindings(wraps: Readonly<Record<string, CodeEditorWrap>>): KeyBinding[] {
  return Object.entries(wraps).map(([key, wrap]) => ({
    key: `Mod-${key}`,
    run: (view) => {
      const { from, to } = view.state.selection.main;
      const selected = view.state.sliceDoc(from, to) || wrap.placeholder;
      const start = from + wrap.before.length;
      view.dispatch({
        changes: { from, to, insert: `${wrap.before}${selected}${wrap.after}` },
        selection: { anchor: start, head: start + selected.length },
      });
      return true;
    },
  }));
}

export function ArtifactCodeEditor({
  value,
  onChange,
  language,
  wraps,
  ariaLabel,
}: ArtifactCodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  const languageSlot = useRef(new Compartment());
  onChangeRef.current = onChange;
  valueRef.current = value;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const extensions: Extension[] = [
      lineNumbers(),
      history(),
      drawSelection(),
      indentOnInput(),
      bracketMatching(),
      highlightActiveLine(),
      syntaxHighlighting(syntaxStyle),
      keymap.of([...wrapBindings(wraps ?? {}), ...defaultKeymap, ...historyKeymap, indentWithTab]),
      languageSlot.current.of([]),
      editorTheme,
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ 'aria-label': ariaLabel, spellcheck: 'false' }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChangeRef.current(update.state.doc.toString());
      }),
    ];
    const view = new EditorView({
      state: EditorState.create({ doc: valueRef.current, extensions }),
      parent: host,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [ariaLabel, wraps]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    const description = language
      ? LanguageDescription.matchLanguageName(languages, language, true)
      : null;
    if (!description) return;
    let cancelled = false;
    void description.load().then((support) => {
      if (cancelled) return;
      viewRef.current?.dispatch({ effects: languageSlot.current.reconfigure(support) });
    });
    return () => {
      cancelled = true;
    };
  }, [language]);

  return (
    <div
      ref={hostRef}
      className="h-full w-full overflow-hidden"
      data-testid="artifact-source-editor"
    />
  );
}
