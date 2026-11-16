import { Alert } from 'react-native';
import type { Attachment } from '../components/AttachmentPreview';

const declinedUploads = new WeakSet<Attachment>();
const uploadsAgreedAhead = new WeakSet<Attachment>();

export function confirmCloudUpload(attachments: readonly Attachment[]): Promise<boolean> {
  const fileNames = attachments.map((attachment) => attachment.fileName).join(', ');
  return new Promise<boolean>((resolve) => {
    let answered = false;
    const answer = (agreed: boolean) => {
      if (answered) return;
      answered = true;
      if (!agreed) for (const attachment of attachments) declinedUploads.add(attachment);
      resolve(agreed);
    };
    Alert.alert(
      'Send files to AGI Cloud?',
      `"${fileNames}" will be uploaded to AGI Cloud to process your message. Files leave this device.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => answer(false) },
        { text: 'Upload & Send', style: 'default', onPress: () => answer(true) },
      ],
      { cancelable: true, onDismiss: () => answer(false) },
    );
  });
}

export function wasCloudUploadDeclined(attachments: readonly Attachment[] | undefined): boolean {
  return attachments?.some((attachment) => declinedUploads.has(attachment)) ?? false;
}

export async function agreeToCloudUploadAhead(
  attachments: readonly Attachment[],
): Promise<boolean> {
  if (attachments.length === 0) return true;
  if (!(await confirmCloudUpload(attachments))) return false;
  for (const attachment of attachments) uploadsAgreedAhead.add(attachment);
  return true;
}

export function takeCloudUploadAgreedAhead(attachments: readonly Attachment[]): boolean {
  if (!attachments.every((attachment) => uploadsAgreedAhead.has(attachment))) return false;
  for (const attachment of attachments) uploadsAgreedAhead.delete(attachment);
  return true;
}
