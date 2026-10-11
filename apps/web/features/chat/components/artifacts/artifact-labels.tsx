import {
  Code2,
  FileCode,
  FileSpreadsheet,
  FileText,
  Globe,
  Image as ImageIcon,
  Mail,
  Presentation,
} from 'lucide-react';
import { cn } from '@shared/lib/utils';
import type { ArtifactData } from './ArtifactPreview';

export const ARTIFACT_KIND_LABEL = 'Artifact';
export const UNTITLED_ARTIFACT_TITLE = 'Untitled';

export function artifactTypeLabel(type: ArtifactData['type']): string {
  switch (type) {
    case 'html':
      return 'HTML';
    case 'react':
      return 'React';
    case 'svg':
      return 'SVG';
    case 'mermaid':
      return 'Diagram';
    case 'code':
      return 'Code';
    case 'document':
      return 'Document';
    case 'spreadsheet':
    case 'csv':
      return 'Spreadsheet';
    case 'table':
      return 'Table';
    case 'presentation':
      return 'Slides';
    case 'email':
      return 'Email';
    case 'image':
      return 'Image';
    case 'chart':
      return 'Chart';
    default:
      return 'File';
  }
}

export function artifactKindLabel(type: ArtifactData['type']): string {
  switch (type) {
    case 'html':
    case 'react':
    case 'svg':
    case 'mermaid':
    case 'code':
      return 'Code';
    case 'spreadsheet':
    case 'csv':
    case 'table':
      return 'Spreadsheet';
    case 'presentation':
      return 'Slides';
    case 'email':
      return 'Email';
    case 'image':
      return 'Image';
    case 'document':
    default:
      return 'Document';
  }
}

const EXTENSION_LABEL: Record<string, string> = {
  markdown: 'MD',
  md: 'MD',
  javascript: 'JS',
  typescript: 'TS',
  python: 'PY',
  html: 'HTML',
  svg: 'SVG',
  csv: 'CSV',
  json: 'JSON',
  document: 'DOC',
  mermaid: 'Mermaid',
};

export function artifactExtensionLabel(artifact: Pick<ArtifactData, 'language' | 'type'>): string {
  const raw = (artifact.language || artifact.type || '').toLowerCase();
  const mapped = EXTENSION_LABEL[raw];
  if (mapped) return mapped;
  return (raw || 'file').toUpperCase().slice(0, 6);
}

export function artifactTitle(artifact: Pick<ArtifactData, 'title'>): string {
  return artifact.title?.trim() || UNTITLED_ARTIFACT_TITLE;
}

export function TypeIcon({ type, className }: { type: ArtifactData['type']; className?: string }) {
  const cls = cn('shrink-0', className);
  switch (type) {
    case 'html':
      return <Globe className={cls} aria-hidden="true" />;
    case 'react':
      return <Code2 className={cls} aria-hidden="true" />;
    case 'svg':
    case 'image':
      return <ImageIcon className={cls} aria-hidden="true" />;
    case 'mermaid':
      return <FileCode className={cls} aria-hidden="true" />;
    case 'spreadsheet':
    case 'table':
    case 'csv':
      return <FileSpreadsheet className={cls} aria-hidden="true" />;
    case 'presentation':
      return <Presentation className={cls} aria-hidden="true" />;
    case 'email':
      return <Mail className={cls} aria-hidden="true" />;
    default:
      return <FileText className={cls} aria-hidden="true" />;
  }
}
