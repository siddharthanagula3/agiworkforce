'use client';

import {
  ORB_STATE,
  ORB_STATE_LABEL,
  orbStateForStatus,
  VoiceOrb as SharedVoiceOrb,
  VoiceOrbCanvas as SharedVoiceOrbCanvas,
  VOICE_SESSION_STATUS,
  type VoiceOrbLevelSource,
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
  level?: VoiceOrbLevelSource;
}

function orbStateFor(status: VoiceSessionStatus, backendBusy: boolean) {
  return backendBusy && status === VOICE_SESSION_STATUS.listening
    ? ORB_STATE.thinking
    : orbStateForStatus(status);
}

export function VoiceOrb({
  status,
  backendBusy = false,
  focus,
  growIn,
  reducedMotion,
  onClick,
  className,
  level,
}: VoiceOrbProps) {
  const orbState = orbStateFor(status, backendBusy);
  return (
    <SharedVoiceOrb
      orbState={orbState}
      label={ORB_STATE_LABEL[orbState]}
      focus={focus}
      growIn={growIn}
      reducedMotion={reducedMotion}
      onClick={onClick}
      className={className}
      {...(level ? { level } : {})}
    />
  );
}

export type VoiceOrbPreviewProps = Omit<VoiceOrbProps, 'onClick' | 'backendBusy'>;

export function VoiceOrbPreview({
  status,
  focus,
  growIn,
  reducedMotion,
  className,
}: VoiceOrbPreviewProps) {
  return (
    <SharedVoiceOrbCanvas
      orbState={orbStateFor(status, false)}
      focus={focus}
      growIn={growIn}
      reducedMotion={reducedMotion}
      className={className}
    />
  );
}
