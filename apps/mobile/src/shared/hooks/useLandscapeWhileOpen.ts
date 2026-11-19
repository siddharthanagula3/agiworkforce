import { useEffect } from 'react';
import { Dimensions, Platform } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

export const LARGE_SCREEN_MIN_WIDTH_DP = 600;

let landscapeHolds = 0;
let stopWatchingSizeClass: (() => void) | null = null;

export function isPhoneFormFactor(): boolean {
  if (Platform.OS === 'ios') return !Platform.isPad;
  if (Platform.OS !== 'android') return false;
  const screen = Dimensions.get('screen');
  return Math.min(screen.width, screen.height) < LARGE_SCREEN_MIN_WIDTH_DP;
}

function lockPhone(lock: ScreenOrientation.OrientationLock): void {
  if (!isPhoneFormFactor()) return;
  void ScreenOrientation.lockAsync(lock).catch(() => undefined);
}

export function lockPhonePortrait(): void {
  if (landscapeHolds === 0) lockPhone(ScreenOrientation.OrientationLock.PORTRAIT_UP);
}

function unlockAgainOnReturnToPhoneSize(): () => void {
  let phone = isPhoneFormFactor();
  const subscription = Dimensions.addEventListener('change', () => {
    const nowPhone = isPhoneFormFactor();
    if (nowPhone && !phone) lockPhone(ScreenOrientation.OrientationLock.DEFAULT);
    phone = nowPhone;
  });
  return () => subscription.remove();
}

export function useLandscapeWhileOpen(open: boolean): void {
  useEffect(() => {
    if (!open) return;
    landscapeHolds += 1;
    if (landscapeHolds === 1) {
      lockPhone(ScreenOrientation.OrientationLock.DEFAULT);
      stopWatchingSizeClass = unlockAgainOnReturnToPhoneSize();
    }
    return () => {
      landscapeHolds -= 1;
      if (landscapeHolds === 0) {
        stopWatchingSizeClass?.();
        stopWatchingSizeClass = null;
        lockPhone(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      }
    };
  }, [open]);
}
