import {
  parseSharedFilesParam,
  sharedFilesToAttachments,
  stageSharedFileAttachments,
} from '@/src/features/share-preview/sharedAttachments';
import { takeComposerAttachments } from '@/src/features/chat/composerHandoff';

const COPIED_FILE = {
  uri: 'file:///data/user/0/com.agiworkforce.app/cache/shared-inbox/1757000000000-photo.jpg',
  fileName: 'photo.jpg',
  mimeType: 'image/jpeg',
  byteSize: 4096,
};

describe('parseSharedFilesParam', () => {
  it('reads the files the Android rewrite copied into the app cache', () => {
    const files = parseSharedFilesParam(JSON.stringify([COPIED_FILE]));
    expect(files).toEqual([COPIED_FILE]);
  });

  it('drops an entry that still points at the content provider', () => {
    const files = parseSharedFilesParam(
      JSON.stringify([
        { ...COPIED_FILE, uri: 'content://media/external/images/media/42' },
        COPIED_FILE,
      ]),
    );
    expect(files).toEqual([COPIED_FILE]);
  });

  it('defaults a missing mime type and omits a missing size', () => {
    const files = parseSharedFilesParam(
      JSON.stringify([{ uri: COPIED_FILE.uri, fileName: 'notes' }]),
    );
    expect(files).toEqual([
      { uri: COPIED_FILE.uri, fileName: 'notes', mimeType: 'application/octet-stream' },
    ]);
  });

  it('returns nothing for a missing, malformed or non-array param', () => {
    expect(parseSharedFilesParam(undefined)).toEqual([]);
    expect(parseSharedFilesParam('')).toEqual([]);
    expect(parseSharedFilesParam('{oops')).toEqual([]);
    expect(parseSharedFilesParam(JSON.stringify({ uri: COPIED_FILE.uri }))).toEqual([]);
  });
});

describe('staging an Android share into the composer', () => {
  it('hands the composer one attachment per copied file', () => {
    const key = stageSharedFileAttachments(parseSharedFilesParam(JSON.stringify([COPIED_FILE])));
    expect(key).toMatch(/^share:/);
    const staged = takeComposerAttachments(key as string);
    expect(staged).toHaveLength(1);
    expect(staged[0]).toMatchObject({
      uri: COPIED_FILE.uri,
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
      fileSize: 4096,
    });
  });

  it('stages nothing when the share carried no readable file', () => {
    expect(stageSharedFileAttachments([])).toBeNull();
    expect(sharedFilesToAttachments([])).toEqual([]);
  });
});
