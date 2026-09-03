import { NativeModules, Platform } from 'react-native';

export interface OcrRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrResult {
  text: string;
  regions: OcrRegion[];
}

export async function recognizeText(imageUri: string): Promise<OcrResult> {
  const mod = NativeModules.AGIVisionOCR as
    | { recognizeText: (uri: string) => Promise<OcrResult> }
    | undefined;

  if (!mod?.recognizeText) {
    throw new Error(
      Platform.OS === 'ios'
        ? 'AGIVisionOCR native module not linked, rebuild the iOS app'
        : 'AGIVisionOCR native module not linked, rebuild the Android app',
    );
  }

  return mod.recognizeText(imageUri);
}
