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
  py: { kind: 'composite', label: 'PY', accent: 'text-yellow-700 dark:text-yellow-300' },
  json: { kind: 'glyph', Icon: FileJson, accent: 'text-amber-700 dark:text-amber-300' },
  html: { kind: 'composite', label: 'HTML', accent: 'text-orange-700 dark:text-orange-300' },
  css: { kind: 'composite', label: 'CSS', accent: 'text-blue-700 dark:text-blue-300' },
  js: { kind: 'composite', label: 'JS', accent: 'text-yellow-700 dark:text-yellow-300' },
  jsx: { kind: 'composite', label: 'JSX', accent: 'text-cyan-700 dark:text-cyan-300' },
  ts: { kind: 'composite', label: 'TS', accent: 'text-blue-700 dark:text-blue-300' },
  tsx: { kind: 'composite', label: 'TSX', accent: 'text-cyan-700 dark:text-cyan-300' },
  pdf: { kind: 'composite', label: 'PDF', accent: 'text-red-700 dark:text-red-300' },
  doc: { kind: 'composite', label: 'DOC', accent: 'text-blue-700 dark:text-blue-300' },
  docx: { kind: 'composite', label: 'DOCX', accent: 'text-blue-700 dark:text-blue-300' },
  csv: { kind: 'glyph', Icon: FileSpreadsheet, accent: 'text-green-700 dark:text-green-300' },
  xls: { kind: 'glyph', Icon: FileSpreadsheet, accent: 'text-green-700 dark:text-green-300' },
  xlsx: { kind: 'glyph', Icon: FileSpreadsheet, accent: 'text-green-700 dark:text-green-300' },
  png: { kind: 'glyph', Icon: FileImage, accent: 'text-purple-700 dark:text-purple-300' },
  jpg: { kind: 'glyph', Icon: FileImage, accent: 'text-purple-700 dark:text-purple-300' },
  jpeg: { kind: 'glyph', Icon: FileImage, accent: 'text-purple-700 dark:text-purple-300' },
  gif: { kind: 'glyph', Icon: FileImage, accent: 'text-purple-700 dark:text-purple-300' },
  webp: { kind: 'glyph', Icon: FileImage, accent: 'text-purple-700 dark:text-purple-300' },
  svg: { kind: 'glyph', Icon: FileImage, accent: 'text-purple-700 dark:text-purple-300' },
  avif: { kind: 'glyph', Icon: FileImage, accent: 'text-purple-700 dark:text-purple-300' },
  zip: { kind: 'glyph', Icon: FileArchive, accent: MUTED },
  tar: { kind: 'glyph', Icon: FileArchive, accent: MUTED },
  gz: { kind: 'glyph', Icon: FileArchive, accent: MUTED },
  rar: { kind: 'glyph', Icon: FileArchive, accent: MUTED },
  sql: { kind: 'composite', label: 'SQL', accent: 'text-sky-700 dark:text-sky-300' },
  sh: { kind: 'glyph', Icon: FileTerminal, accent: 'text-emerald-700 dark:text-emerald-300' },
  bash: { kind: 'glyph', Icon: FileTerminal, accent: 'text-emerald-700 dark:text-emerald-300' },
  zsh: { kind: 'glyph', Icon: FileTerminal, accent: 'text-emerald-700 dark:text-emerald-300' },
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
      className={cn('relative inline-flex h-4 w-4 shrink-0 items-center justify-center', className)}
      aria-hidden="true"
    >
      <File className={cn('h-4 w-4', MUTED)} />
      <span
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-[1.5px] text-center font-semibold uppercase leading-none',
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
