import type { SystemPermissionStatus } from './desktop-privacy';

export const SKILL_CAPTURE_COMMANDS = [
  'skill_capture_status',
  'skill_capture_start',
  'skill_capture_stop',
  'skill_capture_discard',
  'skill_capture_save',
] as const;

export type SkillCaptureCommand = (typeof SKILL_CAPTURE_COMMANDS)[number];

export const SKILL_CAPTURE_CHANNELS = ['screen'] as const;

export type SkillCaptureChannel = (typeof SKILL_CAPTURE_CHANNELS)[number];

export const SKILL_CAPTURE_PHASES = ['idle', 'recording', 'stopped'] as const;

export type SkillCapturePhase = (typeof SKILL_CAPTURE_PHASES)[number];

export const SKILL_CAPTURE_STOP_CAUSES = ['user', 'limit', 'screen-locked', 'failed'] as const;

export type SkillCaptureStopCause = (typeof SKILL_CAPTURE_STOP_CAUSES)[number];

/**
 * The consent wording the page showed. A start that names any other revision is
 * refused, so a page cannot start a recording behind wording the host no longer
 * matches.
 */
export const SKILL_CAPTURE_CONSENT_REVISION = 1;

export const SKILL_CAPTURE_LIMITS = {
  frameIntervalMs: 3_000,
  maxDurationMs: 10 * 60_000,
  maxFrames: 200,
  frameMaxWidth: 1_280,
} as const;

export interface SkillCaptureFrame {
  offsetMs: number;
  mimeType: 'image/jpeg';
  imageBase64: string;
  width: number;
  height: number;
}

export interface SkillCaptureStatus {
  available: boolean;
  unavailableReason: string | null;
  phase: SkillCapturePhase;
  channels: readonly SkillCaptureChannel[];
  startedAt: number | null;
  durationMs: number;
  frameCount: number;
  stoppedBy: SkillCaptureStopCause | null;
  failure: string | null;
  screenRecording: SystemPermissionStatus;
}

export interface SkillCaptureRecording {
  startedAt: number;
  durationMs: number;
  channels: readonly SkillCaptureChannel[];
  frames: SkillCaptureFrame[];
}

export type SkillCaptureStartOutcome =
  | { started: true; status: SkillCaptureStatus }
  | {
      started: false;
      reason: 'declined' | 'permission';
      message: string;
      status: SkillCaptureStatus;
    };

export function isSkillCaptureConsent(value: unknown): boolean {
  return value === SKILL_CAPTURE_CONSENT_REVISION;
}
