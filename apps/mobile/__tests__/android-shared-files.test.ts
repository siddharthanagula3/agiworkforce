jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///data/user/0/com.agiworkforce.app/cache/',
}));

import { Platform } from 'react-native';
import {
  isInsideShareInbox,
  parseSharedFilesParam,
  sharedFilesToAttachments,
  stageSharedFileAttachments,
} from '@/src/features/share-preview/sharedAttachments';
import { takeComposerAttachments } from '@/src/features/chat/composerHandoff';

const APP_DATA = 'file:///data/user/0/com.agiworkforce.app';

const COPIED_FILE = {
  uri: `${APP_DATA}/cache/shared-inbox/shared-1757000000000.jpg`,
  fileName: 'photo.jpg',
  mimeType: 'image/jpeg',
  byteSize: 4096,
};

const originalOS = Platform.OS;

function runOn(os: 'ios' | 'android') {
  Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
}

function linkWith(uri: string): string {
  return JSON.stringify([{ ...COPIED_FILE, uri }]);
}

beforeEach(() => runOn('android'));

afterAll(() => runOn(originalOS as 'ios' | 'android'));

describe('a shared file named on the share link', () => {
  it('is taken from the inbox the Android share rewrite copies into', () => {
    expect(parseSharedFilesParam(linkWith(COPIED_FILE.uri))).toEqual([COPIED_FILE]);
    expect(
      parseSharedFilesParam(linkWith(`${APP_DATA}/cache/shared-inbox/shared-42%20copy.pdf`)),
    ).toHaveLength(1);
  });

  it.each([
    ['the app database', `${APP_DATA}/databases/agi.db`],
    ['the app documents', `${APP_DATA}/files/mmkv/mmkv.default`],
    ['the cache outside the inbox', `${APP_DATA}/cache/chat-upload-part-1.bin`],
    ['a sibling that only starts like the inbox', `${APP_DATA}/cache/shared-inbox-old/a.pdf`],
    ['the inbox directory itself', `${APP_DATA}/cache/shared-inbox/`],
    ['external storage', 'file:///storage/emulated/0/Download/report.pdf'],
    ['the legacy sdcard path', 'file:///sdcard/Download/report.pdf'],
    ['a content provider', 'content://media/external/images/media/42'],
    ['a file URI with a host', 'file://data/user/0/com.agiworkforce.app/cache/shared-inbox/a.pdf'],
  ])('refuses %s', (_label, uri) => {
    expect(parseSharedFilesParam(linkWith(uri))).toEqual([]);
  });

  it.each([
    ['a .. segment', `${APP_DATA}/cache/shared-inbox/../databases/agi.db`],
    ['an encoded .. segment', `${APP_DATA}/cache/shared-inbox/%2e%2e/databases/agi.db`],
    ['an encoded slash', `${APP_DATA}/cache/shared-inbox/..%2Fdatabases%2Fagi.db`],
    ['a doubly encoded .. segment', `${APP_DATA}/cache/shared-inbox/%252e%252e/databases/agi.db`],
    ['a . segment', `${APP_DATA}/cache/shared-inbox/./shared-1.jpg`],
    ['a backslash', `${APP_DATA}/cache/shared-inbox/..\\databases\\agi.db`],
    ['a query', `${APP_DATA}/cache/shared-inbox/a.pdf?/../../databases/agi.db`],
    ['a malformed escape', `${APP_DATA}/cache/shared-inbox/%E0%A4%A.pdf`],
  ])('refuses a path with %s', (_label, uri) => {
    expect(parseSharedFilesParam(linkWith(uri))).toEqual([]);
  });

  it('takes no file from a share link on iOS, where shares arrive through the App Group', () => {
    runOn('ios');
    expect(parseSharedFilesParam(linkWith(COPIED_FILE.uri))).toEqual([]);
  });

  it('keeps the inbox check independent of the caller', () => {
    expect(isInsideShareInbox(COPIED_FILE.uri, 'shared-inbox/')).toBe(true);
    expect(isInsideShareInbox(COPIED_FILE.uri, 'AGISharedInbox/')).toBe(false);
  });
});

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
