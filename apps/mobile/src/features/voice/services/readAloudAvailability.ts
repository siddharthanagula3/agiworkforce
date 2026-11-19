import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { getVoicesForLanguage } from './tts';
import type { VoiceOutputOwner } from './voiceOutput';

export const READ_ALOUD_UNAVAILABLE_REASON = {
  preparing: 'Read aloud is getting ready. Try again in a moment.',
  accountChanged: 'Read aloud is unavailable because the account changed. Reopen this chat.',
  noVoice: 'No speech voice is installed on this device.',
} as const;

const voiceProbes = new WeakMap<VoiceOutputOwner, Promise<boolean>>();

function ownerHasDeviceVoice(owner: VoiceOutputOwner): Promise<boolean> {
  const known = voiceProbes.get(owner);
  if (known) return known;
  const probe = getVoicesForLanguage('').then(
    (voices) => voices.length > 0,
    () => true,
  );
  voiceProbes.set(owner, probe);
  return probe;
}

export function readAloudOwnerReason(
  owner: VoiceOutputOwner | null | undefined,
): string | undefined {
  if (!owner) return READ_ALOUD_UNAVAILABLE_REASON.preparing;
  return owner.isCurrent() ? undefined : READ_ALOUD_UNAVAILABLE_REASON.accountChanged;
}

export function useReadAloudUnavailableReason(
  owner: VoiceOutputOwner | null | undefined,
): string | undefined {
  const ownerReason = readAloudOwnerReason(owner);
  const [voicelessOwner, setVoicelessOwner] = useState<VoiceOutputOwner | null>(null);
  const checksDeviceVoice =
    Platform.OS === 'android' && Boolean(owner) && !ownerReason && owner?.source?.scope !== 'cloud';

  useEffect(() => {
    if (!owner || !checksDeviceVoice) return;
    let live = true;
    void ownerHasDeviceVoice(owner).then((hasVoice) => {
      if (live && !hasVoice) setVoicelessOwner(owner);
    });
    return () => {
      live = false;
    };
  }, [owner, checksDeviceVoice]);

  if (ownerReason) return ownerReason;
  return checksDeviceVoice && voicelessOwner === owner
    ? READ_ALOUD_UNAVAILABLE_REASON.noVoice
    : undefined;
}
