'use client';

import { memo } from 'react';
import {
  File,
  FileArchive,
  FileImage,
  FileJson,
  FileSpreadsheet,
  FileTerminal,
  FileText,
  type Icon,
} from '@agiworkforce/icons';
import { cn } from '@shared/lib/utils';

type GlyphEntry = { kind: 'glyph'; Icon: Icon; accent: string };
type CompositeEntry = { kind: 'composite'; label: string; accent: string };
type Entry = GlyphEntry | CompositeEntry;

const MUTED = 'text-muted-foreground';

const MAP: Record<string, Entry> = {
  md: { kind: 'composite', label: 'MD', accent: MUTED },
  mdx: { kind: 'composite', label: 'MDX', accent: MUTED },
  txt: { kind: 'glyph', Icon: FileText, accent: MUTED },
  py: { kind: 'composite', label: 'PY', accent: MUTED },
  json: { kind: 'glyph', Icon: FileJson, accent: MUTED },
  html: { kind: 'composite', label: 'HTML', accent: MUTED },
  css: { kind: 'composite', label: 'CSS', accent: MUTED },
  js: { kind: 'composite', label: 'JS', accent: MUTED },
  jsx: { kind: 'composite', label: 'JSX', accent: MUTED },
  ts: { kind: 'composite', label: 'TS', accent: MUTED },
  tsx: { kind: 'composite', label: 'TSX', accent: MUTED },
  pdf: { kind: 'composite', label: 'PDF', accent: MUTED },
  doc: { kind: 'composite', label: 'DOC', accent: MUTED },
  docx: { kind: 'composite', label: 'DOCX', accent: MUTED },
  csv: { kind: 'glyph', Icon: FileSpreadsheet, accent: MUTED },
  xls: { kind: 'glyph', Icon: FileSpreadsheet, accent: MUTED },
  xlsx: { kind: 'glyph', Icon: FileSpreadsheet, accent: MUTED },
  png: { kind: 'glyph', Icon: FileImage, accent: MUTED },
  jpg: { kind: 'glyph', Icon: FileImage, accent: MUTED },
  jpeg: { kind: 'glyph', Icon: FileImage, accent: MUTED },
  gif: { kind: 'glyph', Icon: FileImage, accent: MUTED },
  webp: { kind: 'glyph', Icon: FileImage, accent: MUTED },
  svg: { kind: 'glyph', Icon: FileImage, accent: MUTED },
  avif: { kind: 'glyph', Icon: FileImage, accent: MUTED },
  zip: { kind: 'glyph', Icon: FileArchive, accent: MUTED },
  tar: { kind: 'glyph', Icon: FileArchive, accent: MUTED },
  gz: { kind: 'glyph', Icon: FileArchive, accent: MUTED },
  rar: { kind: 'glyph', Icon: FileArchive, accent: MUTED },
  sql: { kind: 'composite', label: 'SQL', accent: MUTED },
  sh: { kind: 'glyph', Icon: FileTerminal, accent: MUTED },
  bash: { kind: 'glyph', Icon: FileTerminal, accent: MUTED },
  zsh: { kind: 'glyph', Icon: FileTerminal, accent: MUTED },
  yml: { kind: 'composite', label: 'YML', accent: MUTED },
  yaml: { kind: 'composite', label: 'YAML', accent: MUTED },
};

export function extensionOf(filename: string): string {
  const base = filename.trim().split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return '';
  return base.slice(dot + 1).toLowerCase();
}

interface FileTypeIconProps {
  filename: string;
  className?: string;
}

const FileTypeIconComponent = ({ filename, className }: FileTypeIconProps) => {
  const ext = extensionOf(filename);
  const entry: Entry =
    MAP[ext] ??
    (ext
      ? { kind: 'composite', label: ext.slice(0, 4).toUpperCase(), accent: MUTED }
      : { kind: 'glyph', Icon: File, accent: MUTED });

  if (entry.kind === 'glyph') {
    const Icon = entry.Icon;
    return <Icon className={cn('h-4 w-4 shrink-0', entry.accent, className)} aria-hidden="true" />;
  }

  return (
    <span
      className={cn(
        'relative inline-flex h-4 w-4 min-w-max shrink-0 items-center justify-center',
        className,
      )}
      aria-hidden="true"
    >
      <File className={cn('pointer-events-none absolute h-4 w-4', MUTED)} />
      <span
        className={cn(
          'pointer-events-none relative text-center font-semibold uppercase leading-none',
          'text-caption tracking-tight',
          entry.accent,
        )}
      >
        {entry.label}
      </span>
    </span>
  );
};

export const FileTypeIcon = memo(FileTypeIconComponent);
FileTypeIcon.displayName = 'FileTypeIcon';
