import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { MANAGED_MEDIA_IMAGE_REF_MAX_B64_LENGTH } from '@agiworkforce/cloud-contracts';

export async function readReferenceImageBase64(uri: string): Promise<string> {
  const base64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
  if (!base64) throw new Error('The reference image could not be read from this device.');
  if (base64.length > MANAGED_MEDIA_IMAGE_REF_MAX_B64_LENGTH) {
    throw new Error('The reference image is too large to send to AGI Cloud.');
  }
  return base64;
}
