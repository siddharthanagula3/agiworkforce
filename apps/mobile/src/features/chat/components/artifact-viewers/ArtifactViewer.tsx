import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';
import { spacing } from '@/src/ui/theme/tokens';
import { ZoomableImage } from '../ZoomableImage';
import { DocumentFileView } from './DocumentFileView';
import { StoredImageView } from './StoredImageView';
import { TabularGridView } from './TabularGridView';
import { TableFileView, TextFileView } from './TextFileView';
import { WorkbookFileView } from './WorkbookFileView';
import { PresentationDeckView } from './presentation/PresentationDeckView';
import { StudyDocumentView } from './study/StudyDocumentView';
import { studyArtifactContent } from './study/studyContent';
import {
  artifactViewerKind,
  isWorkbookFile,
  storedImagePath,
  type ArtifactViewerSource,
} from './viewerKind';

export interface ArtifactViewerProps {
  source: ArtifactViewerSource;
  page?: number;
  renderMarkdown?: (text: string) => ReactNode;
  onAsk?: (prompt: string) => void;
  onSave?: (content: string) => void;
  handEdited?: boolean;
}

/**
 * Draws an artifact or file with the viewer its type calls for. Renders
 * nothing when the app has no viewer for it, so a caller asks
 * {@link artifactViewerKind} first and keeps its own view otherwise.
 */
export function ArtifactViewer({
  source,
  page,
  renderMarkdown,
  onAsk,
  onSave,
  handEdited,
}: ArtifactViewerProps) {
  const kind = artifactViewerKind(source);
  if (kind === null) return null;

  if (source.origin === 'inline') {
    if (kind === 'deck') {
      return renderMarkdown ? (
        <PresentationDeckView
          title={source.title}
          content={source.content}
          renderMarkdown={renderMarkdown}
          {...(onAsk ? { onAsk } : {})}
          {...(onSave ? { onSave } : {})}
          {...(handEdited ? { handEdited } : {})}
        />
      ) : null;
    }
    if (kind === 'study') {
      const document = studyArtifactContent(source.language, source.content);
      return renderMarkdown && document !== null ? (
        <ScrollView
          testID="artifact-viewer-study"
          contentContainerStyle={{ padding: spacing.lg }}
          keyboardShouldPersistTaps="handled"
        >
          <StudyDocumentView
            content={document}
            renderMarkdown={renderMarkdown}
            {...(onAsk ? { onAsk } : {})}
          />
        </ScrollView>
      ) : null;
    }
    return <TabularGridView title={source.title} content={source.content} />;
  }

  switch (kind) {
    case 'image': {
      const path = storedImagePath(source.url);
      return path ? (
        <ZoomableImage resetKey={path} testID="artifact-viewer-image">
          {({ maxHeight }) => (
            <StoredImageView path={path} label={source.fileName} style={{ maxHeight }} />
          )}
        </ZoomableImage>
      ) : null;
    }
    case 'document':
      return isWorkbookFile(source) ? (
        <WorkbookFileView source={source} />
      ) : (
        <DocumentFileView source={source} {...(page ? { page } : {})} />
      );
    case 'table':
      return <TableFileView source={source} />;
    case 'text':
      return <TextFileView source={source} />;
    case 'deck':
    case 'study':
      return null;
  }
}

export { artifactViewerKind, viewerSourceForArtifact } from './viewerKind';
export type { ArtifactViewerKind, ArtifactViewerSource, FileViewerSource } from './viewerKind';
