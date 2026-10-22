'use client';

import { useCallback, useId } from 'react';
import { useDesktopHost } from '@/features/desktop-host';
import { useSkillAuthoringCapability } from '@/features/skills/components/save-as-skill';
import { openRecorder, useRecorderState } from '../lib/recorder-store';

export interface SkillRecorderEntry {
  /** The shell is the desktop app and its host reports it can record the screen. */
  hosted: boolean;
  /** Hosted, and the account can turn a recording into a skill. */
  available: boolean;
  recording: boolean;
  recorderId: string;
  open: () => void;
}

export function useSkillRecorderEntry(): SkillRecorderEntry {
  const host = useDesktopHost();
  const hosted = host?.shell === 'electron';
  const recorder = useRecorderState();
  const supported = hosted && recorder.supported;
  const canAuthor = useSkillAuthoringCapability(supported);
  const recorderId = useId();
  const open = useCallback(() => openRecorder(recorderId), [recorderId]);
  return {
    hosted,
    available: supported && canAuthor,
    recording: recorder.status?.phase === 'recording',
    recorderId,
    open,
  };
}
