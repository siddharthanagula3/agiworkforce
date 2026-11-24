import { useState, type ClipboardEvent, type DragEvent } from 'react';
import { DEVELOPER_TURN_LIMITS } from '@agiworkforce/local-runtime-contract';
import { useAttachments } from '@features/chat/hooks/use-attachments';
import { resolveChatAttachmentMimeType } from '@/lib/chat-attachment-policy';
import { LOCAL_CODE_COPY } from '../local-code';

export function codeImageDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error(LOCAL_CODE_COPY.turnFailed));
    reader.onerror = () => reject(reader.error ?? new Error(LOCAL_CODE_COPY.turnFailed));
    reader.readAsDataURL(file);
  });
}

export function useCodeImages(
  unavailable: string | null,
  onNotice: (notice: string | null) => void,
) {
  const images = useAttachments({
    maxFiles: DEVELOPER_TURN_LIMITS.images,
    maxFileSize: DEVELOPER_TURN_LIMITS.imageBytes,
    onError: onNotice,
  });
  const [dragging, setDragging] = useState(false);

  const addImages = (files: File[]) => {
    if (unavailable !== null) {
      onNotice(unavailable);
      return;
    }
    const pictures = files.filter((file) =>
      resolveChatAttachmentMimeType(file.name, file.type)?.startsWith('image/'),
    );
    onNotice(pictures.length < files.length ? LOCAL_CODE_COPY.imagesOnly : null);
    if (pictures.length === 0) return;
    if (images.attachments.length + pictures.length > DEVELOPER_TURN_LIMITS.images) {
      onNotice(LOCAL_CODE_COPY.tooManyImages(DEVELOPER_TURN_LIMITS.images));
      return;
    }
    if (pictures.some((file) => file.size > DEVELOPER_TURN_LIMITS.imageBytes)) {
      onNotice(LOCAL_CODE_COPY.imageTooLarge(`${DEVELOPER_TURN_LIMITS.imageBytes / 1_000_000} MB`));
      return;
    }
    images.addFiles(pictures);
  };

  return {
    ...images,
    addImages,
    onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const files = Array.from(event.clipboardData.files);
      if (files.length === 0) return;
      event.preventDefault();
      addImages(files);
    },
    dropTarget: {
      'data-image-drop-active': dragging && unavailable === null ? true : undefined,
      onDragOver: (event: DragEvent<HTMLDivElement>) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setDragging(unavailable === null);
      },
      onDragLeave: (event: DragEvent<HTMLDivElement>) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        setDragging(false);
      },
      onDrop: (event: DragEvent<HTMLDivElement>) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        setDragging(false);
        const files = Array.from(event.dataTransfer.files);
        if (files.length > 0) addImages(files);
      },
    },
  };
}
