/**
 * artifactUtils.tsx
 *
 * Shared utilities for artifact type display: icons and file extensions.
 * Used by ArtifactPanel and ArtifactToolbar to avoid duplicating switch statements.
 */

import {
  Code2,
  FileSpreadsheet,
  FileText,
  Globe,
  Image,
  Network,
  Presentation,
} from 'lucide-react';
import type { ArtifactType } from '@/stores/artifactStore';

/**
 * Returns the file extension string for the given artifact type.
 */
export function getArtifactFileExtension(type: ArtifactType): string {
  switch (type) {
    case 'code':
      return 'txt';
    case 'document':
      return 'md';
    case 'spreadsheet':
      return 'csv';
    case 'diagram':
      return 'mmd';
    case 'web':
      return 'html';
    case 'chart':
      return 'json';
    case 'presentation':
      return 'md';
    default:
      return 'txt';
  }
}

/**
 * Icon component for an artifact type. Accepts an optional className override.
 */
export function ArtifactTypeIcon({
  type,
  className = 'h-3.5 w-3.5',
}: {
  type: ArtifactType;
  className?: string;
}) {
  switch (type) {
    case 'code':
      return <Code2 className={className} />;
    case 'document':
      return <FileText className={className} />;
    case 'spreadsheet':
    case 'chart':
      return <FileSpreadsheet className={className} />;
    case 'diagram':
      return <Network className={className} />;
    case 'web':
      return <Globe className={className} />;
    case 'presentation':
      return <Presentation className={className} />;
    case 'image':
      return <Image className={className} />;
    default:
      return <Code2 className={className} />;
  }
}
