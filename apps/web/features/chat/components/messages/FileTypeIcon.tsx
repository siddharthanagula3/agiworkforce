'use client';

import { memo } from 'react';
import {
  File,
  FileText,
  FileJson,
  FileSpreadsheet,
  FileImage,
  FileArchive,
  FileTerminal,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@shared/lib/utils';

type GlyphEntry = { kind: 'glyph'; Icon: LucideIcon; accent: string };
type CompositeEntry = { kind: 'composite'; label: string; accent: string };
type Entry = GlyphEntry | CompositeEntry;

const MUTED = 'text-muted-foreground';

const MAP: Record<string, Entry> = {
  md: { kind: 'composite', label: 'MD', accent: MUTED },
  mdx: { kind: 'composite', label: 'MDX', accent: MUTED },
  txt: { kind: 'glyph', Icon: FileText, accent: MUTED },
  py: { kind: 'composite', label: 'PY', accent: 'text-yellow-500' },
  json: { kind: 'glyph', Icon: FileJson, accent: 'text-amber-500' },
  html: { kind: 'composite', label: 'HTML', accent: 'text-orange-500' },
  css: { kind: 'composite', label: 'CSS', accent: 'text-blue-500' },
  js: { kind: 'composite', label: 'JS', accent: 'text-yellow-400' },
  jsx: { kind: 'composite', label: 'JSX', accent: 'text-cyan-500' },
  ts: { kind: 'composite', label: 'TS', accent: 'text-blue-500' },
  tsx: { kind: 'composite', label: 'TSX', accent: 'text-cyan-500' },
  pdf: { kind: 'composite', label: 'PDF', accent: 'text-red-500' },
  doc: { kind: 'composite', label: 'DOC', accent: 'text-blue-600' },
  docx: { kind: 'composite', label: 'DOCX', accent: 'text-blue-600' },
  csv: { kind: 'glyph', Icon: FileSpreadsheet, accent: 'text-green-500' },
  xls: { kind: 'glyph', Icon: FileSpreadsheet, accent: 'text-green-600' },
  xlsx: { kind: 'glyph', Icon: FileSpreadsheet, accent: 'text-green-600' },
  png: { kind: 'glyph', Icon: FileImage, accent: 'text-purple-500' },
  jpg: { kind: 'glyph', Icon: FileImage, accent: 'text-purple-500' },
  jpeg: { kind: 'glyph', Icon: FileImage, accent: 'text-purple-500' },
  gif: { kind: 'glyph', Icon: FileImage, accent: 'text-purple-500' },
  webp: { kind: 'glyph', Icon: FileImage, accent: 'text-purple-500' },
  svg: { kind: 'glyph', Icon: FileImage, accent: 'text-purple-500' },
  avif: { kind: 'glyph', Icon: FileImage, accent: 'text-purple-500' },
  zip: { kind: 'glyph', Icon: FileArchive, accent: MUTED },
  tar: { kind: 'glyph', Icon: FileArchive, accent: MUTED },
  gz: { kind: 'glyph', Icon: FileArchive, accent: MUTED },
  rar: { kind: 'glyph', Icon: FileArchive, accent: MUTED },
  sql: { kind: 'composite', label: 'SQL', accent: 'text-sky-500' },
  sh: { kind: 'glyph', Icon: FileTerminal, accent: 'text-emerald-500' },
  bash: { kind: 'glyph', Icon: FileTerminal, accent: 'text-emerald-500' },
  zsh: { kind: 'glyph', Icon: FileTerminal, accent: 'text-emerald-500' },
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
          'text-[6px] tracking-tight',
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
