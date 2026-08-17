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
const lockedManifestBody = lockedManifest.replace(/<!--[\s\S]*?-->/g, '');

const listingIos = JSON.parse(
  readFileSync(join(storeListingDir, 'LISTING-METADATA-IOS.json'), 'utf8'),
) as {
  privacy_nutrition_labels: {
    data_not_collected: boolean;
    data_linked_to_you: Array<{ category: string; data_types: string[] }>;
  };
};

const listingAndroid = JSON.parse(
  readFileSync(join(storeListingDir, 'LISTING-METADATA-ANDROID.json'), 'utf8'),
) as {
  data_safety: {
    data_collected: boolean;
    data_collected_types: Array<{ type: string }>;
  };
};

const UPLOADED_DATA_TYPES = [
  'NSPrivacyCollectedDataTypeEmailAddress',
  'NSPrivacyCollectedDataTypeName',
  'NSPrivacyCollectedDataTypeOtherUserContent',
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

  it('marks every collected type as linked, non-tracking, app-functionality only', () => {
    for (const entry of configuredCollected) {
      expect(entry.NSPrivacyCollectedDataTypeLinked).toBe(true);
      expect(entry.NSPrivacyCollectedDataTypeTracking).toBe(false);
      expect(entry.NSPrivacyCollectedDataTypePurposes).toEqual([
        'NSPrivacyCollectedDataTypePurposeAppFunctionality',
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
      'Photos',
      'Files and docs',
      'User IDs',
      'Device or other IDs',
    ]) {
      expect(declared).toContain(dataType);
    }
  });
});
