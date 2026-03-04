/**
 * useAttachments Hook
 *
 * Manages attachment state including file reading, validation, and removal.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Attachment } from '@/stores/unified/unifiedChatStore';
import { getModelMetadata } from '@/constants/llm';
import { useSimpleModeStore } from '@/stores/unified/ui';

export const ATTACHMENT_LIMITS = {
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB per file
  MAX_TOTAL_SIZE: 200 * 1024 * 1024, // 200MB total
  MAX_COUNT: 10, // Maximum 10 attachments per message
  MAX_PASTE_FILE_SIZE: 10 * 1024 * 1024, // 10MB limit for paste
  MAX_CONCURRENT_READS: 3, // Limit concurrent FileReaders
};

export interface UseAttachmentsOptions {
  selectedModel?: string | null;
  onError?: (error: string) => void;
}

export interface UseAttachmentsReturn {
  attachments: Attachment[];
  isProcessingAttachments: boolean;
  handleFilesAdded: (files: File[]) => Promise<void>;
  handlePaste: (event: React.ClipboardEvent) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
  cleanup: () => void;
}

export function useAttachments(options: UseAttachmentsOptions = {}): UseAttachmentsReturn {
  const { selectedModel, onError } = options;

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isProcessingAttachments, setIsProcessingAttachments] = useState(false);

  const fileReadersRef = useRef<FileReader[]>([]);
  // AUDIT-005-006 fix: Track mount state to prevent state updates after unmount
  const isMountedRef = useRef(true);

  // Set up mount tracking
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * Read a file as base64 data URL
   */
  const readFileAsBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      fileReadersRef.current.push(reader);

      reader.onload = () => {
        fileReadersRef.current = fileReadersRef.current.filter((r) => r !== reader);
        resolve(reader.result as string);
      };

      reader.onerror = () => {
        fileReadersRef.current = fileReadersRef.current.filter((r) => r !== reader);
        reject(new Error(`Failed to read file: ${file.name}`));
      };

      reader.readAsDataURL(file);
    });
  }, []);

  /**
   * Cleanup function for FileReaders
   */
  const cleanup = useCallback(() => {
    fileReadersRef.current.forEach((reader) => {
      try {
        if (reader.readyState === FileReader.LOADING) {
          reader.abort();
        }
      } catch (err) {
        console.error('[useAttachments] Error aborting FileReader:', err);
      }
    });
    fileReadersRef.current = [];
  }, []);

  /**
   * Handle files added (from file picker or drag/drop)
   */
  const handleFilesAdded = useCallback(
    async (files: File[]) => {
      // Validate file sizes
      const oversizedFiles: string[] = [];
      let totalSize = 0;

      for (const file of files) {
        if (file.size > ATTACHMENT_LIMITS.MAX_FILE_SIZE) {
          oversizedFiles.push(`${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
        }
        totalSize += file.size;
      }

      if (oversizedFiles.length > 0) {
        onError?.(`File(s) exceed 50MB limit: ${oversizedFiles.join(', ')}`);
        return;
      }

      // Check total attachment count
      const totalAttachments = attachments.length + files.length;
      if (totalAttachments > ATTACHMENT_LIMITS.MAX_COUNT) {
        onError?.(
          `Maximum ${ATTACHMENT_LIMITS.MAX_COUNT} attachments allowed (${totalAttachments} provided)`,
        );
        return;
      }

      // Check total size across all attachments
      const currentTotalSize = attachments.reduce((sum, att) => sum + (att.size || 0), 0);
      if (currentTotalSize + totalSize > ATTACHMENT_LIMITS.MAX_TOTAL_SIZE) {
        onError?.(`Total attachment size would exceed 200MB limit`);
        return;
      }

      // Check for image files
      const hasImages = files.some((f) => f.type.startsWith('image/'));
      const metadata = selectedModel ? getModelMetadata(selectedModel) : null;

      // If we have images and the model explicitly doesn't support vision
      if (hasImages && metadata && metadata.capabilities?.['vision'] === false) {
        const isSimple = useSimpleModeStore.getState().mode === 'simple';
        onError?.(
          isSimple
            ? "This model can't see images. Please choose a different model from the dropdown above, or remove the image."
            : `The model "${metadata.name}" does not support image attachments. Please switch to a vision-capable model like GPT-5.2 or Claude Sonnet.`,
        );
        // Filter out images, but allow other files if any
        const nonImageFiles = files.filter((f) => !f.type.startsWith('image/'));
        if (nonImageFiles.length === 0) return;

        // Convert non-image files to base64
        setIsProcessingAttachments(true);
        try {
          const newAttachments: Attachment[] = await Promise.all(
            nonImageFiles.map(async (file) => {
              const base64Content = await readFileAsBase64(file);
              return {
                id: crypto.randomUUID(),
                type: 'file' as const,
                name: file.name,
                size: file.size,
                mimeType: file.type,
                content: base64Content,
              };
            }),
          );
          setAttachments((prev) => [...prev, ...newAttachments]);
        } finally {
          setIsProcessingAttachments(false);
        }
        return;
      }

      // Convert all files to base64 for backend compatibility
      setIsProcessingAttachments(true);
      try {
        const newAttachments: Attachment[] = await Promise.all(
          files.map(async (file) => {
            const base64Content = await readFileAsBase64(file);
            // Determine attachment type based on MIME type
            let attachmentType: 'image' | 'audio' | 'file' = 'file';
            if (file.type.startsWith('image/')) {
              attachmentType = 'image';
            } else if (file.type.startsWith('audio/')) {
              attachmentType = 'audio';
            }
            return {
              id: crypto.randomUUID(),
              type: attachmentType,
              name: file.name,
              size: file.size,
              mimeType: file.type,
              content: base64Content,
            };
          }),
        );
        setAttachments((prev) => [...prev, ...newAttachments]);
      } catch (error) {
        console.error('[useAttachments] Error reading files:', error);
        onError?.('Failed to process one or more files. Please try again.');
      } finally {
        setIsProcessingAttachments(false);
      }
    },
    [selectedModel, attachments, readFileAsBase64, onError],
  );

  /**
   * Handle paste events for images
   */
  const handlePaste = useCallback(
    (event: React.ClipboardEvent) => {
      const items = Array.from(event.clipboardData.items).filter((item) =>
        item.type.startsWith('image/'),
      );
      if (items.length === 0) return;

      // Check vision capability for pasted images
      const metadata = selectedModel ? getModelMetadata(selectedModel) : null;
      if (metadata && metadata.capabilities?.['vision'] === false) {
        event.preventDefault();
        const isSimple = useSimpleModeStore.getState().mode === 'simple';
        onError?.(
          isSimple
            ? "This model can't see images. Please choose a different model from the dropdown above."
            : `The model "${metadata.name}" does not support image attachments. Please switch to a vision-capable model like GPT-5.2 or Claude Sonnet.`,
        );
        return;
      }

      event.preventDefault();

      items.forEach((item) => {
        const file = item.getAsFile();
        if (!file) return;

        // Skip files that are too large
        if (file.size > ATTACHMENT_LIMITS.MAX_PASTE_FILE_SIZE) {
          onError?.(
            `Pasted file is too large (${(file.size / 1024 / 1024).toFixed(2)}MB). Maximum is 10MB.`,
          );
          return;
        }

        // Throttle concurrent reads to prevent memory exhaustion
        if (fileReadersRef.current.length >= ATTACHMENT_LIMITS.MAX_CONCURRENT_READS) {
          onError?.('Too many files being processed. Please wait and try again.');
          return;
        }

        const reader = new FileReader();
        // AUDIT-005-006 fix: Push reader to ref BEFORE calling readAsDataURL
        // to ensure cleanup can track it even if callback fires synchronously
        fileReadersRef.current.push(reader);

        reader.onerror = () => {
          fileReadersRef.current = fileReadersRef.current.filter((r) => r !== reader);
          // AUDIT-005-006 fix: Check if component is still mounted before showing error
          if (isMountedRef.current) {
            onError?.('Failed to read pasted file. Please try again.');
          }
        };

        reader.onloadend = (e) => {
          // AUDIT-005-006 fix: Always clean up the reader reference first
          fileReadersRef.current = fileReadersRef.current.filter((r) => r !== reader);

          // AUDIT-005-006 fix: Check if component is still mounted before updating state
          if (!isMountedRef.current) {
            return;
          }

          // Check for read errors (onloadend fires for both success and error)
          if (reader.error) {
            return; // Error already handled in onerror
          }

          try {
            const base64 = e.target?.result as string;
            if (!base64 || base64.length === 0) {
              onError?.('Pasted file is empty or unreadable.');
              return;
            }

            const attachment: Attachment = {
              id: crypto.randomUUID(),
              type: 'image',
              name: 'pasted-image.png',
              size: file.size,
              mimeType: file.type,
              content: base64,
            };
            setAttachments((prev) => [...prev, attachment]);
          } catch (err) {
            console.error('[useAttachments] Error processing pasted file:', err);
            onError?.('Error processing pasted file. Please try again.');
          }
        };

        reader.readAsDataURL(file);
      });
    },
    [selectedModel, onError],
  );

  /**
   * Remove an attachment by ID
   */
  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const attachment = prev.find((item) => item.id === id);
      if (attachment?.path?.startsWith('blob:')) URL.revokeObjectURL(attachment.path);
      return prev.filter((item) => item.id !== id);
    });
  }, []);

  /**
   * Clear all attachments
   */
  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

  return {
    attachments,
    isProcessingAttachments,
    handleFilesAdded,
    handlePaste,
    removeAttachment,
    clearAttachments,
    setAttachments,
    cleanup,
  };
}

export default useAttachments;
