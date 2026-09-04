'use client';

import { ChevronDown, ChevronRight, Copy, Code2, Eye, FileText, Folder } from 'lucide-react';
import { useMemo, useState } from 'react';

import { cn } from '../cn';
import {
  SKILL_COPY_LABEL,
  SKILL_DOWNLOAD_FILE_LABEL,
  SKILL_FILES_LABEL,
  SKILL_NO_PREVIEW_COPY,
  SKILL_RAW_LABEL,
  SKILL_RENDERED_LABEL,
} from './constants';
import { buildFileTree, type DirectoryTreeNode } from './filtering';
import { highlightLine, isCodeFile, splitLines, type HighlightKind } from './highlight';
import { DIRECTORY_FOCUS_RING, DIRECTORY_ICON_BUTTON } from './styles';
import type { DirectoryDetailFile } from './types';

const INDENT_REM_PER_LEVEL = 0.75;

const TOKEN_CLASS: Record<HighlightKind, string> = {
  plain: 'text-foreground',
  comment: 'text-muted-foreground',
  string: 'text-success-text',
  number: 'text-info-text',
  keyword: 'text-accent-text',
};

export function CodeBlock({ content }: { content: string }) {
  const lines = useMemo(() => splitLines(content), [content]);
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-background p-3">
      <table className="w-full border-collapse font-mono text-xs">
        <tbody>
          {lines.map((line, index) => (
            <tr key={`${index}-${line.slice(0, 8)}`}>
              <td className="select-none pr-3 text-right align-top text-muted-foreground">
                {index + 1}
              </td>
              <td className="whitespace-pre align-top">
                {highlightLine(line).map((token, tokenIndex) => (
                  <span key={tokenIndex} className={TOKEN_CLASS[token.kind]}>
                    {token.text}
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RenderedBody({ content }: { content: string }) {
  const paragraphs = useMemo(
    () =>
      content
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean),
    [content],
  );
  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed text-foreground">
      {paragraphs.map((paragraph, index) => (
        <p key={`${index}-${paragraph.slice(0, 12)}`} className="whitespace-pre-line">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

function collapsedPaths(
  nodes: readonly DirectoryTreeNode[],
  open: ReadonlySet<string>,
): Set<string> {
  const hidden = new Set<string>();
  for (const node of nodes) {
    const cut = node.path.lastIndexOf('/');
    if (cut === -1) continue;
    const parent = node.path.slice(0, cut);
    if (hidden.has(parent) || !open.has(parent)) hidden.add(node.path);
  }
  return hidden;
}

export function SkillFileTree({
  files,
  selectedPath,
  onSelect,
}: {
  files: readonly DirectoryDetailFile[];
  selectedPath: string | undefined;
  onSelect: (path: string) => void;
}) {
  const nodes = useMemo(() => buildFileTree(files), [files]);
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const hidden = useMemo(() => collapsedPaths(nodes, openFolders), [nodes, openFolders]);

  const toggle = (path: string) =>
    setOpenFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  return (
    <nav aria-label={SKILL_FILES_LABEL} className="flex flex-col gap-0.5">
      {nodes
        .filter((node) => !hidden.has(node.path))
        .map((node) => {
          const indent = { paddingLeft: `${node.depth * INDENT_REM_PER_LEVEL}rem` };
          if (node.kind === 'folder') {
            const expanded = openFolders.has(node.path);
            const Chevron = expanded ? ChevronDown : ChevronRight;
            return (
              <button
                key={node.path}
                type="button"
                aria-expanded={expanded}
                onClick={() => toggle(node.path)}
                style={indent}
                className={cn(
                  'inline-flex min-h-7 items-center gap-1 rounded-md px-2 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground',
                  DIRECTORY_FOCUS_RING,
                )}
              >
                <Chevron aria-hidden className="size-3.5" />
                <Folder aria-hidden className="size-3.5" />
                {node.label}
              </button>
            );
          }
          const active = node.path === selectedPath;
          return (
            <button
              key={node.path}
              type="button"
              aria-current={active ? 'true' : undefined}
              onClick={() => onSelect(node.path)}
              style={indent}
              className={cn(
                'inline-flex min-h-7 items-center gap-1.5 rounded-md px-2 text-left text-xs',
                active
                  ? 'bg-muted font-medium text-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                DIRECTORY_FOCUS_RING,
              )}
            >
              <FileText aria-hidden className="size-3.5" />
              {node.label}
            </button>
          );
        })}
    </nav>
  );
}

export function SkillFileBody({
  path,
  content,
  previewable,
  onCopy,
  onDownload,
}: {
  path: string;
  content: string | undefined;
  previewable: boolean;
  onCopy?: (content: string) => void;
  onDownload?: () => void;
}) {
  const code = isCodeFile(path);
  const [raw, setRaw] = useState(code);

  if (!previewable) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-sm text-muted-foreground">{SKILL_NO_PREVIEW_COPY}</p>
        {onDownload ? (
          <button
            type="button"
            onClick={onDownload}
            className={cn(
              'inline-flex min-h-9 items-center rounded-md border border-border px-3 text-sm text-foreground hover:bg-muted',
              DIRECTORY_FOCUS_RING,
            )}
          >
            {SKILL_DOWNLOAD_FILE_LABEL}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          aria-pressed={!raw}
          aria-label={SKILL_RENDERED_LABEL}
          onClick={() => setRaw(false)}
          className={cn(
            DIRECTORY_ICON_BUTTON,
            !raw && 'bg-muted text-foreground',
            DIRECTORY_FOCUS_RING,
          )}
        >
          <Eye aria-hidden className="size-4" />
        </button>
        <button
          type="button"
          aria-pressed={raw}
          aria-label={SKILL_RAW_LABEL}
          onClick={() => setRaw(true)}
          className={cn(
            DIRECTORY_ICON_BUTTON,
            raw && 'bg-muted text-foreground',
            DIRECTORY_FOCUS_RING,
          )}
        >
          <Code2 aria-hidden className="size-4" />
        </button>
        {onCopy && content !== undefined ? (
          <button
            type="button"
            aria-label={SKILL_COPY_LABEL}
            onClick={() => onCopy(content)}
            className={cn(DIRECTORY_ICON_BUTTON, DIRECTORY_FOCUS_RING)}
          >
            <Copy aria-hidden className="size-4" />
          </button>
        ) : null}
      </div>
      {raw ? <CodeBlock content={content ?? ''} /> : <RenderedBody content={content ?? ''} />}
    </div>
  );
}
