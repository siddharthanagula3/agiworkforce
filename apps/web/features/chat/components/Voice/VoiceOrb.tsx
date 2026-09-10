'use client';

import {
  ORB_STATE,
  ORB_STATE_LABEL,
  orbStateForStatus,
  VoiceOrb as SharedVoiceOrb,
  VOICE_SESSION_STATUS,
  type VoiceSessionStatus,
} from '@agiworkforce/unified-chat';

export interface VoiceOrbProps {
  status: VoiceSessionStatus;
  backendBusy?: boolean;
  focus: boolean;
  growIn: boolean;
  reducedMotion: boolean;
  onClick: () => void;
  className?: string;
}

export function VoiceOrb({
  status,
  backendBusy = false,
  focus,
  growIn,
  reducedMotion,
  onClick,
  className,
}: VoiceOrbProps) {
  const orbState =
    backendBusy && status === VOICE_SESSION_STATUS.listening
      ? ORB_STATE.thinking
      : orbStateForStatus(status);
  return (
    <SharedVoiceOrb
      orbState={orbState}
      label={ORB_STATE_LABEL[orbState]}
      focus={focus}
      growIn={growIn}
      reducedMotion={reducedMotion}
      onClick={onClick}
      className={className}
    />
  );
}
