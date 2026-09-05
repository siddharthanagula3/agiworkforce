import type { ComponentType } from 'react';
import {
  Archive,
  Code2,
  FileJson,
  FileSpreadsheet,
  FileText,
  FileType,
  Image as ImageIcon,
  Layers,
  Presentation,
} from 'lucide-react';
import type { GeneratedFileKind } from '@agiworkforce/types';

type Glyph = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

const GLYPH_BY_KIND: Readonly<Record<GeneratedFileKind, Glyph>> = {
  image: ImageIcon,
  pdf: FileText,
  docx: FileType,
  xlsx: FileSpreadsheet,
  csv: FileSpreadsheet,
  pptx: Presentation,
  json: FileJson,
  markdown: FileText,
  html: Code2,
  archive: Archive,
  other: Layers,
};

export function FileKindIcon({ kind, className }: { kind: GeneratedFileKind; className?: string }) {
  const Glyph = GLYPH_BY_KIND[kind] ?? Layers;
  return <Glyph className={className} aria-hidden />;
}
