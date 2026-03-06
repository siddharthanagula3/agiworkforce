import React, { memo, useCallback, useMemo } from 'react';
import { FileDiff } from 'lucide-react';
import { DiffViewer } from '../Visualizations/DiffViewer';
import { WidgetRegistry } from './WidgetRegistry';
import type { WidgetActionEvent, WidgetRendererProps } from './index';

export interface DiffViewerWidgetData {
  id: string;
  type: 'diff-viewer';
  oldContent: string;
  newContent: string;
  fileName?: string;
  filePath?: string;
  language?: string;
  viewMode?: 'split' | 'unified';
  showLineNumbers?: boolean;
  highlightChanges?: boolean;
  enableRevert?: boolean;
  createdAt?: string;
}

const DiffWidgetComponent: React.FC<WidgetRendererProps<DiffViewerWidgetData>> = ({
  widget,
  onAction,
  readOnly = false,
}) => {
  const {
    id,
    oldContent,
    newContent,
    fileName,
    filePath,
    language,
    viewMode = 'split',
    showLineNumbers = true,
    highlightChanges = true,
    enableRevert = false,
  } = widget;

  const canRevert = useMemo(() => enableRevert && !readOnly, [enableRevert, readOnly]);

  const handleRevert = useCallback(async () => {
    const event: WidgetActionEvent = {
      widgetId: id,
      action: 'revert',
      payload: {
        filePath,
        fileName,
      },
    };
    onAction?.(event);
  }, [id, filePath, fileName, onAction]);

  return (
    <DiffViewer
      oldContent={oldContent}
      newContent={newContent}
      fileName={fileName}
      filePath={filePath}
      language={language}
      viewMode={viewMode}
      showLineNumbers={showLineNumbers}
      highlightChanges={highlightChanges}
      enableRevert={canRevert}
      onRevert={canRevert ? handleRevert : undefined}
      className="bg-card"
    />
  );
};

DiffWidgetComponent.displayName = 'DiffWidget';

export const DiffWidget = memo(DiffWidgetComponent);

WidgetRegistry.register({
  type: 'diff-viewer',
  displayName: 'Diff Viewer',
  component: DiffWidget as React.ComponentType<any>,
  icon: FileDiff,
});
