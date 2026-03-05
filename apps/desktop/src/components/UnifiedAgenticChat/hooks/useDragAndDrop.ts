/**
 * useDragAndDrop Hook
 *
 * Handles drag and drop file upload functionality.
 */

import { useEffect, useRef, useState } from 'react';

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
  const dragDepthRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      dragDepthRef.current = 0;
      setIsDragging(false);
      return;
    }

    const hasDraggedFiles = (e: DragEvent): boolean => {
      const types = Array.from(e.dataTransfer?.types || []);
      return types.includes('Files');
    };

    const handleDragEnter = (e: DragEvent) => {
      if (!hasDraggedFiles(e)) return;
      e.preventDefault();
      dragDepthRef.current += 1;
      setIsDragging(true);
    };

    const handleDragOver = (e: DragEvent) => {
      if (!hasDraggedFiles(e)) return;
      e.preventDefault();
      setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      if (!hasDraggedFiles(e)) return;
      e.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setIsDragging(false);
      }
    };

    const handleDrop = (e: DragEvent) => {
      if (!hasDraggedFiles(e)) return;
      e.preventDefault();
      dragDepthRef.current = 0;
      setIsDragging(false);
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length > 0) {
        onFilesAdded(files);
      }
    };

    document.addEventListener('dragenter', handleDragEnter);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('drop', handleDrop);

    return () => {
      dragDepthRef.current = 0;
      setIsDragging(false);
      document.removeEventListener('dragenter', handleDragEnter);
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('drop', handleDrop);
    };
  }, [enabled, onFilesAdded]);

  return { isDragging };
}

export default useDragAndDrop;
