'use client';

import { useState, type ComponentType, type FormEvent } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import {
  Bold,
  Code,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Quote,
  Redo2,
  SquareCode,
  Strikethrough,
  Table,
  Undo2,
} from 'lucide-react';
import { cn } from '@shared/lib/utils';

export const TEXT_STYLE_LABEL = 'Text style';
export const FORMATTING_TOOLBAR_LABEL = 'Formatting';

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;
type HeadingLevel = (typeof HEADING_LEVELS)[number];

const MODIFIER =
  typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl+';
const ALT = MODIFIER === '⌘' ? '⌥' : 'Alt+';

function safeHref(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function ToolbarButton({
  label,
  shortcut,
  icon: Icon,
  active,
  disabled,
  onClick,
}: {
  label: string;
  shortcut?: string;
  icon: ComponentType<{ className?: string }>;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={cn(
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 sm:h-8 sm:w-8',
        active && 'bg-[var(--chat-surface-hover)] text-foreground',
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-[var(--chat-border)]" aria-hidden="true" />;
}

export function DocumentFormattingToolbar({ editor }: { editor: Editor }) {
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const level = HEADING_LEVELS.find((candidate) =>
        current.isActive('heading', { level: candidate }),
      );
      return {
        block: level ? `h${level}` : current.isActive('codeBlock') ? 'code' : 'p',
        bold: current.isActive('bold'),
        italic: current.isActive('italic'),
        strike: current.isActive('strike'),
        code: current.isActive('code'),
        link: current.isActive('link'),
        linkHref: (current.getAttributes('link')['href'] as string | undefined) ?? '',
        bulletList: current.isActive('bulletList'),
        orderedList: current.isActive('orderedList'),
        taskList: current.isActive('taskList'),
        blockquote: current.isActive('blockquote'),
        inTable: current.isActive('table'),
        canUndo: current.can().undo(),
        canRedo: current.can().redo(),
      };
    },
  });

  const setBlock = (value: string) => {
    const chain = editor.chain().focus();
    if (value === 'p') chain.setParagraph().run();
    else if (value === 'code') chain.setCodeBlock().run();
    else chain.setHeading({ level: Number(value.slice(1)) as HeadingLevel }).run();
  };

  const applyLink = (event: FormEvent) => {
    event.preventDefault();
    if (linkDraft === null) return;
    const href = safeHref(linkDraft);
    if (href) editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    setLinkDraft(null);
  };

  return (
    <div className="shrink-0 border-b border-border/30 bg-card/60">
      <div
        role="toolbar"
        aria-label={FORMATTING_TOOLBAR_LABEL}
        className="flex items-center gap-0.5 overflow-x-auto px-2 py-1 scrollbar-none"
        data-testid="document-formatting-toolbar"
      >
        <select
          aria-label={TEXT_STYLE_LABEL}
          value={state.block}
          onChange={(event) => setBlock(event.target.value)}
          className="h-11 shrink-0 rounded-md border border-border/60 bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8"
          data-testid="document-text-style"
        >
          <option value="p">Normal text</option>
          {HEADING_LEVELS.map((level) => (
            <option key={level} value={`h${level}`}>
              Heading {level}
            </option>
          ))}
          <option value="code">Code block</option>
        </select>
        <Divider />
        <ToolbarButton
          label="Bold"
          shortcut={`${MODIFIER}B`}
          icon={Bold}
          active={state.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          label="Italic"
          shortcut={`${MODIFIER}I`}
          icon={Italic}
          active={state.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          label="Strikethrough"
          icon={Strikethrough}
          active={state.strike}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        />
        <ToolbarButton
          label="Inline code"
          icon={Code}
          active={state.code}
          onClick={() => editor.chain().focus().toggleCode().run()}
        />
        <ToolbarButton
          label="Link"
          icon={Link2}
          active={state.link}
          onClick={() => setLinkDraft((current) => (current === null ? state.linkHref : null))}
        />
        <Divider />
        <ToolbarButton
          label="Bulleted list"
          icon={List}
          active={state.bulletList}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          label="Numbered list"
          icon={ListOrdered}
          active={state.orderedList}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarButton
          label="Checklist"
          icon={ListChecks}
          active={state.taskList}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
        />
        <ToolbarButton
          label="Quote"
          icon={Quote}
          active={state.blockquote}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        />
        <ToolbarButton
          label="Code block"
          shortcut={`${MODIFIER}${ALT}C`}
          icon={SquareCode}
          active={state.block === 'code'}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        />
        <ToolbarButton
          label="Insert table"
          icon={Table}
          disabled={state.inTable}
          onClick={() =>
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
        />
        <Divider />
        <ToolbarButton
          label="Undo"
          shortcut={`${MODIFIER}Z`}
          icon={Undo2}
          disabled={!state.canUndo}
          onClick={() => editor.chain().focus().undo().run()}
        />
        <ToolbarButton
          label="Redo"
          shortcut={`${MODIFIER}Shift+Z`}
          icon={Redo2}
          disabled={!state.canRedo}
          onClick={() => editor.chain().focus().redo().run()}
        />
      </div>
      {linkDraft !== null ? (
        <form onSubmit={applyLink} className="flex items-center gap-2 px-3 pb-2">
          <label htmlFor="document-link-input" className="sr-only">
            Link address
          </label>
          <input
            id="document-link-input"
            autoFocus
            value={linkDraft}
            onChange={(event) => setLinkDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setLinkDraft(null);
                editor.commands.focus();
              }
            }}
            placeholder="Paste or type a link"
            className="h-11 min-w-0 flex-1 rounded-md border border-border/60 bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8"
          />
          <button
            type="submit"
            className="h-11 shrink-0 rounded-md bg-primary px-3 text-sm text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8"
          >
            Apply
          </button>
          {state.link ? (
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().extendMarkRange('link').unsetLink().run();
                setLinkDraft(null);
              }}
              className="h-11 shrink-0 rounded-md px-3 text-sm text-muted-foreground hover:bg-[var(--chat-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8"
            >
              Remove link
            </button>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
