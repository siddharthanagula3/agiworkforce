import type { DocumentPickerAsset } from 'expo-document-picker';
import { resolveChatAttachmentMimeType } from '@agiworkforce/cloud-contracts';
import { bareMediaType, fileMediaTypeForName } from '@agiworkforce/types';
import type { Attachment } from '../components/AttachmentPreview';
import type { ComposerAttachmentScope } from '../useComposerAttachmentScope';

export interface PreparingAttachmentHandle {
  settle: () => void;
  fail: () => void;
}

export interface ComposerAttachmentOperation extends ComposerAttachmentScope {
  addAttachments: (items: Attachment[]) => void;
  beginPreparing?: () => PreparingAttachmentHandle;
}

const UNKNOWN_DOCUMENT_TYPE = 'application/octet-stream';

export function attachmentFromPickedDocument(
  asset: Pick<DocumentPickerAsset, 'name' | 'uri' | 'mimeType' | 'size'>,
): Attachment {
  const fileName = asset.name || 'document';
  let mimeType = bareMediaType(asset.mimeType ?? '') || UNKNOWN_DOCUMENT_TYPE;

  if (mimeType === UNKNOWN_DOCUMENT_TYPE) {
    const nameType = fileMediaTypeForName(fileName);
    const inferred = resolveChatAttachmentMimeType(
      fileName,
      nameType === UNKNOWN_DOCUMENT_TYPE ? '' : nameType,
    );
    if (inferred && !inferred.startsWith('image/')) mimeType = inferred;
  }

  return {
    id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    uri: asset.uri,
    mimeType,
    fileName,
    fileSize: asset.size,
  };
}

export async function runComposerAttachmentPick(
  operation: ComposerAttachmentOperation | null | undefined,
  pick: (
    scope: ComposerAttachmentScope,
    onPicked: (count: number) => void,
  ) => Promise<Attachment[]>,
  onError: (error: unknown) => void,
): Promise<void> {
  if (!operation?.isCurrent()) return;
  const preparing: PreparingAttachmentHandle[] = [];
  const prepareOneMore = (): boolean => {
    const handle = operation.beginPreparing?.();
    if (handle) preparing.push(handle);
    return Boolean(handle);
  };
  const onPicked = (count: number) => {
    while (operation.isCurrent() && preparing.length < count) {
      if (!prepareOneMore()) return;
    }
  };
  const settleAll = () => {
    for (const handle of preparing.splice(0)) handle.settle();
  };
  prepareOneMore();
  try {
    const attachments = await pick(operation, onPicked);
    settleAll();
    if (operation.isCurrent() && attachments.length > 0) operation.addAttachments(attachments);
  } catch (error) {
    if (operation.isCurrent()) {
      const failed = preparing.shift();
      settleAll();
      failed?.fail();
      onError(error);
    } else {
      settleAll();
    }
  }
}
