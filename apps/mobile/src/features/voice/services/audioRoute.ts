import { Platform } from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  type AVAudioSessionCategoryOptionsValue,
  type SetCategoryOptions,
} from 'expo-speech-recognition';

export const AUDIO_ROUTES = ['auto', 'speaker', 'bluetooth', 'headset'] as const;

export type AudioRoute = (typeof AUDIO_ROUTES)[number];

export const AUDIO_ROUTE_LABELS: Readonly<Record<AudioRoute, string>> = Object.freeze({
  auto: 'Automatic',
  speaker: 'Speaker',
  bluetooth: 'Bluetooth',
  headset: 'Headset',
});

export const AUDIO_ROUTE_HINTS: Readonly<Record<AudioRoute, string>> = Object.freeze({
  auto: 'Follow whatever this device is connected to',
  speaker: 'Play out loud, ignore a paired headset',
  bluetooth: 'Prefer a paired Bluetooth headset',
  headset: 'Prefer a wired headset or the earpiece',
});

const ROUTE_CATEGORY_OPTIONS: Readonly<Record<AudioRoute, readonly string[]>> = Object.freeze({
  auto: ['allowBluetooth', 'defaultToSpeaker'],
  speaker: ['defaultToSpeaker'],
  bluetooth: ['allowBluetooth', 'allowBluetoothA2DP'],
  headset: [],
});

export function isAudioRoute(value: unknown): value is AudioRoute {
  return typeof value === 'string' && (AUDIO_ROUTES as readonly string[]).includes(value);
}

export function audioSessionCategoryFor(route: AudioRoute): SetCategoryOptions {
  return {
    category: 'playAndRecord',
    categoryOptions: [...ROUTE_CATEGORY_OPTIONS[route]] as AVAudioSessionCategoryOptionsValue[],
    mode: 'measurement',
  };
}

/**
 * A route is derived from the options rather than stored natively, so a session
 * another surface configured is still reported honestly.
 */
export function audioRouteFromCategoryOptions(options: readonly string[]): AudioRoute {
  const set = new Set(options);
  const speaker = set.has('defaultToSpeaker');
  const bluetooth = set.has('allowBluetooth') || set.has('allowBluetoothA2DP');
  if (speaker && bluetooth) return 'auto';
  if (speaker) return 'speaker';
  if (bluetooth) return 'bluetooth';
  return 'headset';
}

export function audioRouteSwitchingSupported(): boolean {
  return Platform.OS === 'ios';
}

export function applyAudioRoute(route: AudioRoute): boolean {
  if (!audioRouteSwitchingSupported()) return false;
  try {
    ExpoSpeechRecognitionModule.setCategoryIOS(audioSessionCategoryFor(route));
    return true;
  } catch {
    return false;
  }
}

export function readActiveAudioRoute(): AudioRoute | null {
  if (!audioRouteSwitchingSupported()) return null;
  try {
    const active = ExpoSpeechRecognitionModule.getAudioSessionCategoryAndOptionsIOS();
    return audioRouteFromCategoryOptions(active.categoryOptions);
  } catch {
    return null;
  }
}
