/* eslint-disable @typescript-eslint/no-require-imports */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const appConfig = require('../app.config.js') as {
  expo: { ios?: { privacyManifests?: Record<string, unknown> } };
};

const storeListingDir = join(__dirname, '..', 'store-listing');

const configuredCollected = (
  (appConfig.expo.ios?.privacyManifests?.['NSPrivacyCollectedDataTypes'] ?? []) as Array<{
    NSPrivacyCollectedDataType: string;
    NSPrivacyCollectedDataTypeLinked: boolean;
    NSPrivacyCollectedDataTypeTracking: boolean;
    NSPrivacyCollectedDataTypePurposes: string[];
  }>
).map((entry) => entry);

const lockedManifest = readFileSync(join(storeListingDir, 'ios', 'PrivacyInfo.xcprivacy'), 'utf8');
const lockedManifestBody = lockedManifest.replace(/\x3c!--[\s\S]*?-->/g, '');

const listingIos = JSON.parse(
  readFileSync(join(storeListingDir, 'LISTING-METADATA-IOS.json'), 'utf8'),
) as {
  privacy_nutrition_labels: {
    data_not_collected: boolean;
    data_linked_to_you: Array<{
      category: string;
      data_types: string[];
      collected_when: string;
    }>;
  };
};

const listingAndroid = JSON.parse(
  readFileSync(join(storeListingDir, 'LISTING-METADATA-ANDROID.json'), 'utf8'),
) as {
  data_safety: {
    data_collected: boolean;
    data_collected_types: Array<{ type: string; collected_when: string }>;
    note: string;
  };
};

const dataSafety = JSON.parse(
  readFileSync(join(storeListingDir, 'android', 'data-safety.json'), 'utf8'),
) as {
  sharingBasis: string;
  collectedData: Array<{ iosPrivacyManifestType: string; backedBy: string }>;
};

const UPLOADED_DATA_TYPES = [
  'NSPrivacyCollectedDataTypeEmailAddress',
  'NSPrivacyCollectedDataTypeName',
  'NSPrivacyCollectedDataTypeOtherUserContent',
  'NSPrivacyCollectedDataTypeAudioData',
  'NSPrivacyCollectedDataTypePhotosorVideos',
  'NSPrivacyCollectedDataTypeUserID',
  'NSPrivacyCollectedDataTypeDeviceID',
] as const;

describe('mobile privacy declarations match what the cloud path actually uploads', () => {
  it('declares conversation content, attachments and identifiers in the generated manifest', () => {
    const declared = configuredCollected.map((entry) => entry.NSPrivacyCollectedDataType);
    for (const dataType of UPLOADED_DATA_TYPES) {
      expect(declared).toContain(dataType);
    }
  });

  it('marks every collected type as linked and non-tracking, with product interaction the only analytics type', () => {
    for (const entry of configuredCollected) {
      expect(entry.NSPrivacyCollectedDataTypeLinked).toBe(true);
      expect(entry.NSPrivacyCollectedDataTypeTracking).toBe(false);
      expect(entry.NSPrivacyCollectedDataTypePurposes).toEqual([
        entry.NSPrivacyCollectedDataType === 'NSPrivacyCollectedDataTypeProductInteraction'
          ? 'NSPrivacyCollectedDataTypePurposeAnalytics'
          : 'NSPrivacyCollectedDataTypePurposeAppFunctionality',
      ]);
    }
  });

  it('carries the same collected types in the locked App Review copy', () => {
    for (const dataType of UPLOADED_DATA_TYPES) {
      expect(lockedManifestBody).toContain(`<string>${dataType}</string>`);
    }
  });

  it('declares user content and identifiers in the App Store nutrition labels', () => {
    const labels = listingIos.privacy_nutrition_labels;
    expect(labels.data_not_collected).toBe(false);
    const declared = labels.data_linked_to_you.flatMap((row) => row.data_types);
    for (const dataType of [
      'Email Address',
      'Name',
      'Other User Content',
      'Audio Data',
      'Photos or Videos',
      'User ID',
      'Device ID',
    ]) {
      expect(declared).toContain(dataType);
    }
  });

  it('declares user content and identifiers in the Play data safety form', () => {
    const safety = listingAndroid.data_safety;
    expect(safety.data_collected).toBe(true);
    const declared = safety.data_collected_types.map((row) => row.type);
    for (const dataType of [
      'Email address',
      'Name',
      'Other in-app messages',
      'Voice or sound recordings',
      'Photos',
      'Files and docs',
      'User IDs',
      'Device or other IDs',
    ]) {
      expect(declared).toContain(dataType);
    }
  });

  it('names direct OpenAI live audio without treating on-device dictation as an upload', () => {
    const disclosures = [
      listingIos.privacy_nutrition_labels.data_linked_to_you.find((row) =>
        row.data_types.includes('Audio Data'),
      )?.collected_when,
      listingAndroid.data_safety.data_collected_types.find(
        (row) => row.type === 'Voice or sound recordings',
      )?.collected_when,
      dataSafety.collectedData.find(
        (row) => row.iosPrivacyManifestType === 'NSPrivacyCollectedDataTypeAudioData',
      )?.backedBy,
    ];

    for (const disclosure of disclosures) {
      expect(disclosure).toMatch(/directly (?:from the device )?to OpenAI/);
      expect(disclosure).toMatch(/on-device.*upload no microphone audio/);
      expect(disclosure).not.toMatch(/microphone(?: audio)?(?: is streamed)? to AGI Cloud/);
    }
  });

  it('does not use a false device transport claim to justify Play sharing answers', () => {
    for (const disclosure of [listingAndroid.data_safety.note, dataSafety.sharingBasis]) {
      expect(disclosure).toMatch(/directly from the device to OpenAI/);
      expect(disclosure).toMatch(/data-processing terms must be verified before submission/);
      expect(disclosure).not.toMatch(/every outbound request|no third party receives/i);
    }
  });
});
