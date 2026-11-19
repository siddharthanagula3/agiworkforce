import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MANAGED_MEDIA_MAX_IMAGE_REFERENCES } from '@agiworkforce/cloud-contracts';
import {
  captureAccountScopedUiState,
  isAccountScopedUiStateOwned,
} from '@/src/features/auth/services/accountScopedUiState';
import { useTierStore } from '@/src/features/billing/store';
import type {
  Attachment,
  PreparingAttachment,
} from '@/src/features/chat/components/AttachmentPreview';
import {
  runComposerAttachmentPick,
  type PreparingAttachmentHandle,
} from '@/src/features/chat/utils/runComposerAttachmentPick';
import {
  imageAssetsToChatAttachments,
  pickImageAssetsFromLibrary,
} from '@/src/features/media/photo-picker';
import {
  PICTURE_METADATA_RECOVERY_MESSAGE,
  PictureMetadataError,
} from '@/src/features/media/image-metadata';
import { useChatViewStore } from '@/stores/chat/chatViewStore';
import { imageCreationOnPlan } from './imageCreationAvailability';
import { IMAGE_REFERENCES_UNAVAILABLE, resolveImageReferenceModel } from './imageReferenceModel';

export const IMAGE_REFERENCE_LIMIT = MANAGED_MEDIA_MAX_IMAGE_REFERENCES + 1;
export const IMAGE_REFERENCE_LIMIT_REACHED = `You can add up to ${IMAGE_REFERENCE_LIMIT} photos.`;
export const IMAGE_REFERENCE_DUPLICATE = 'Each photo can be added once.';
export const IMAGE_REFERENCE_PICK_FAILED = 'Could not open Photos. Please try again.';

export type ImageReferencePaperclip = 'ready' | 'full' | 'unavailable';

export interface ImageReferences {
  attachments: Attachment[];
  preparing: PreparingAttachment[];
  paperclip: ImageReferencePaperclip;
  busy: boolean;
  modelNote: string | null;
  pick: () => Promise<void>;
  remove: (id: string) => void;
  dismissPreparing: (id: string) => void;
  clear: () => void;
}

function photoIdentities(attachment: Attachment): string[] {
  return [
    `uri:${attachment.uri}`,
    ...(attachment.pickerAssetId ? [`picker:${attachment.pickerAssetId}`] : []),
  ];
}

export function useImageReferences(onMessage: (message: string) => void): ImageReferences {
  const tier = useTierStore((s) => s.tier);
  const grantedCapabilities = useTierStore((s) => s.grantedCapabilities);
  const selectedMediaModel = useChatViewStore((s) => s.selectedMediaModel);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [preparing, setPreparing] = useState<PreparingAttachment[]>([]);
  const attachmentsRef = useRef<Attachment[]>([]);
  const preparingRef = useRef<PreparingAttachment[]>([]);
  const preparingSeq = useRef(0);
  const picking = useRef(false);
  const generation = useRef(0);

  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );

  const model = useMemo(() => resolveImageReferenceModel(selectedMediaModel), [selectedMediaModel]);
  const available = model.status === 'ready' && imageCreationOnPlan(tier, grantedCapabilities);
  const occupied = attachments.length + preparing.filter((item) => !item.failed).length;
  const paperclip: ImageReferencePaperclip = !available
    ? 'unavailable'
    : occupied >= IMAGE_REFERENCE_LIMIT
      ? 'full'
      : 'ready';
  const modelNote =
    available && model.status === 'ready' && model.switched && occupied > 0
      ? `Using ${model.name}, which can work with photos.`
      : null;

  const updatePreparing = useCallback(
    (update: (current: PreparingAttachment[]) => PreparingAttachment[]) => {
      preparingRef.current = update(preparingRef.current);
      setPreparing(preparingRef.current);
    },
    [],
  );

  const add = useCallback(
    (items: Attachment[]) => {
      const seen = new Set(attachmentsRef.current.flatMap(photoIdentities));
      const fresh: Attachment[] = [];
      for (const item of items) {
        const identities = photoIdentities(item);
        if (identities.some((identity) => seen.has(identity))) continue;
        identities.forEach((identity) => seen.add(identity));
        fresh.push(item);
      }
      if (fresh.length < items.length) onMessage(IMAGE_REFERENCE_DUPLICATE);
      const room = IMAGE_REFERENCE_LIMIT - attachmentsRef.current.length;
      if (fresh.length > room) onMessage(IMAGE_REFERENCE_LIMIT_REACHED);
      attachmentsRef.current = [...attachmentsRef.current, ...fresh.slice(0, room)];
      setAttachments(attachmentsRef.current);
    },
    [onMessage],
  );

  const pick = useCallback(async () => {
    if (picking.current) return;
    if (paperclip === 'unavailable') {
      onMessage(IMAGE_REFERENCES_UNAVAILABLE);
      return;
    }
    if (paperclip === 'full') {
      onMessage(IMAGE_REFERENCE_LIMIT_REACHED);
      return;
    }
    const ownership = captureAccountScopedUiState('cloud');
    if (!ownership) return;
    const room = IMAGE_REFERENCE_LIMIT - occupied;
    const pickGeneration = generation.current;
    const isCurrent = () =>
      generation.current === pickGeneration && isAccountScopedUiStateOwned(ownership);
    picking.current = true;
    try {
      await runComposerAttachmentPick(
        {
          isCurrent,
          addAttachments: add,
          beginPreparing: (): PreparingAttachmentHandle => {
            preparingSeq.current += 1;
            const id = `preparing-${preparingSeq.current}`;
            updatePreparing((current) => [...current, { id, failed: false }]);
            return {
              settle: () => updatePreparing((current) => current.filter((item) => item.id !== id)),
              fail: () =>
                updatePreparing((current) =>
                  current.map((item) => (item.id === id ? { ...item, failed: true } : item)),
                ),
            };
          },
        },
        async (scope, onPicked) => {
          const assets = await pickImageAssetsFromLibrary({
            allowsMultipleSelection: true,
            selectionLimit: room,
            orderedSelection: true,
            onPicked,
          });
          return scope.isCurrent() ? imageAssetsToChatAttachments(assets) : [];
        },
        (error) => {
          onMessage(
            error instanceof PictureMetadataError
              ? PICTURE_METADATA_RECOVERY_MESSAGE
              : IMAGE_REFERENCE_PICK_FAILED,
          );
        },
      );
    } finally {
      picking.current = false;
    }
  }, [add, occupied, onMessage, paperclip, updatePreparing]);

  const remove = useCallback((id: string) => {
    attachmentsRef.current = attachmentsRef.current.filter((item) => item.id !== id);
    setAttachments(attachmentsRef.current);
  }, []);

  const dismissPreparing = useCallback(
    (id: string) => updatePreparing((current) => current.filter((item) => item.id !== id)),
    [updatePreparing],
  );

  const clear = useCallback(() => {
    generation.current += 1;
    attachmentsRef.current = [];
    setAttachments([]);
    preparingRef.current = [];
    setPreparing([]);
  }, []);

  return {
    attachments,
    preparing,
    paperclip,
    busy: preparing.some((item) => !item.failed),
    modelNote,
    pick,
    remove,
    dismissPreparing,
    clear,
  };
}
