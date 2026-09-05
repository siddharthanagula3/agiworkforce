'use client';

import {
  orbStateForStatus,
  orbStateLabel,
  VoiceOrb as SharedVoiceOrb,
  type VoiceSessionStatus,
} from '@agiworkforce/unified-chat';

export interface VoiceOrbProps {
  status: VoiceSessionStatus;
  focus: boolean;
  growIn: boolean;
  reducedMotion: boolean;
  onClick: () => void;
  className?: string;
}

export function VoiceOrb({
  status,
  focus,
  growIn,
  reducedMotion,
  onClick,
  className,
}: VoiceOrbProps) {
  return (
    <SharedVoiceOrb
      orbState={orbStateForStatus(status)}
      label={orbStateLabel(status)}
      focus={focus}
      growIn={growIn}
      reducedMotion={reducedMotion}
      onClick={onClick}
      className={className}
    />
  );
}
