'use client';

import {
  GOOGLE_DRIVE_PICKER_PATH,
  GoogleDrivePickerResponseSchema,
  type GoogleDrivePickerResponse,
} from '@agiworkforce/cloud-contracts';

const GOOGLE_API_SCRIPT = 'https://apis.google.com/js/api.js';

interface PickerDocument {
  id: string;
}

interface PickerResult {
  action: string;
  docs?: PickerDocument[];
}

interface PickerBuilder {
  addView(view: unknown): PickerBuilder;
  enableFeature(feature: string): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(appId: string): PickerBuilder;
  setCallback(callback: (result: PickerResult) => void): PickerBuilder;
  build(): { setVisible(visible: boolean): void };
}

interface GooglePickerNamespace {
  PickerBuilder: new () => PickerBuilder;
  DocsView: new () => { setIncludeFolders(include: boolean): unknown };
  Feature: { MULTISELECT_ENABLED: string };
  Action: { PICKED: string; CANCEL: string };
}

interface GoogleApiWindow extends Window {
  gapi?: { load(name: string, callback: () => void): void };
  google?: { picker?: GooglePickerNamespace };
}

const PICKER_UNREACHABLE_COPY = 'Google Drive could not be reached. Try again.';

export async function fetchGoogleDrivePickerConfig(): Promise<GoogleDrivePickerResponse> {
  const response = await fetch(GOOGLE_DRIVE_PICKER_PATH, {
    credentials: 'same-origin',
  });
  if (!response.ok) throw new Error(PICKER_UNREACHABLE_COPY);
  const parsed = GoogleDrivePickerResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error(PICKER_UNREACHABLE_COPY);
  return parsed.data;
}

let pickerLoad: Promise<GooglePickerNamespace> | null = null;

function loadGooglePicker(): Promise<GooglePickerNamespace> {
  if (pickerLoad) return pickerLoad;
  pickerLoad = new Promise<GooglePickerNamespace>((resolve, reject) => {
    const win = window as GoogleApiWindow;
    const finish = () => {
      if (!win.gapi) {
        reject(new Error('Google Drive could not be opened. Try again.'));
        return;
      }
      win.gapi.load('picker', () => {
        const picker = win.google?.picker;
        if (picker) resolve(picker);
        else reject(new Error('Google Drive could not be opened. Try again.'));
      });
    };
    if (win.gapi) {
      finish();
      return;
    }
    const script = document.createElement('script');
    script.src = GOOGLE_API_SCRIPT;
    script.async = true;
    script.onload = finish;
    script.onerror = () => reject(new Error('Google Drive could not be opened. Try again.'));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    pickerLoad = null;
    throw error;
  });
  return pickerLoad;
}

export async function pickGoogleDriveFiles(
  config: Extract<GoogleDrivePickerResponse, { status: 'ready' }>,
): Promise<string[]> {
  const picker = await loadGooglePicker();
  return new Promise<string[]>((resolve) => {
    new picker.PickerBuilder()
      .addView(new picker.DocsView().setIncludeFolders(false))
      .enableFeature(picker.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(config.accessToken)
      .setDeveloperKey(config.developerKey)
      .setAppId(config.appId)
      .setCallback((result) => {
        if (result.action === picker.Action.PICKED) {
          resolve((result.docs ?? []).map((doc) => doc.id));
        } else if (result.action === picker.Action.CANCEL) {
          resolve([]);
        }
      })
      .build()
      .setVisible(true);
  });
}
