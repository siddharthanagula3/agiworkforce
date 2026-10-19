jest.mock('expo-file-system/legacy', () => ({
  EncodingType: { Base64: 'base64' },
  cacheDirectory: 'file:///cache/',
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
}));

import * as Clipboard from 'expo-clipboard';
import { writeAsStringAsync } from 'expo-file-system/legacy';
import {
  clipboardHasImage,
  readClipboardImageAttachment,
} from '@/src/features/media/clipboard-image';

describe('pasting an image from the clipboard', () => {
  it('writes the copied image to a file and attaches it', async () => {
    (Clipboard.getImageAsync as jest.Mock).mockResolvedValueOnce({
      data: 'data:image/png;base64,iVBORw0KGgo=',
      size: { width: 640, height: 480 },
    });

    const attachment = await readClipboardImageAttachment();

    expect(attachment).toEqual(
      expect.objectContaining({ mimeType: 'image/png', width: 640, height: 480 }),
    );
    expect(attachment?.uri).toMatch(/^file:\/\/\/cache\/pasted-\d+\.png$/);
    expect(writeAsStringAsync).toHaveBeenCalledWith(attachment?.uri, 'iVBORw0KGgo=', {
      encoding: 'base64',
    });
  });

  it('has nothing to attach when the clipboard holds no image', async () => {
    (Clipboard.getImageAsync as jest.Mock).mockResolvedValueOnce(null);
    expect(await readClipboardImageAttachment()).toBeNull();
    (Clipboard.hasImageAsync as jest.Mock).mockRejectedValueOnce(new Error('denied'));
    expect(await clipboardHasImage()).toBe(false);
  });
});
