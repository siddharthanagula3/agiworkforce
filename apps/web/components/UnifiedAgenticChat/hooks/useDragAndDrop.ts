/**
 * useDragAndDrop Hook
 *
 * Handles drag and drop file upload functionality.
 */

import { useEffect, useState } from 'react';

export interface UseDragAndDropOptions {
  /** Callback when files are dropped */
  onFilesAdded: (files: File[]) => void;
  /** Whether drag and drop is enabled */
  enabled?: boolean;
}

export interface UseDragAndDropReturn {
  /** Whether user is currently dragging over the drop zone */
  isDragging: boolean;
}

export function useDragAndDrop(options: UseDragAndDropOptions): UseDragAndDropReturn {
  const { onFilesAdded, enabled = true } = options;
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      if (e.target === document.body) {
        setIsDragging(false);
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length > 0) {
        onFilesAdded(files);
      }
    };

    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('drop', handleDrop);

    return () => {
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('drop', handleDrop);
    };
  }, [enabled, onFilesAdded]);

  return { isDragging };
}

export default useDragAndDrop;
