'use client';

import {
  DesktopRuntimeError,
  SKILL_CAPTURE_CONSENT_REVISION,
  getHostBridge,
  type SkillCaptureRecording,
  type SkillCaptureStartOutcome,
  type SkillCaptureStatus,
} from '@agiworkforce/local-runtime-contract';

export class SkillCaptureHostMissing extends Error {
  constructor() {
    super('Recording a skill is only available in the desktop app.');
    this.name = 'SkillCaptureHostMissing';
  }
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const host = getHostBridge();
  if (!host || host.shell !== 'electron') throw new SkillCaptureHostMissing();
  const response = await host.invokeRuntime<T>(command, args);
  if (response.ok) return response.value;
  throw new DesktopRuntimeError(response.error);
}

export function readSkillCapture(): Promise<SkillCaptureStatus> {
  return invoke<SkillCaptureStatus>('skill_capture_status');
}

/**
 * Names the consent revision the page showed. The host refuses any other
 * revision and then asks the user itself before anything is captured.
 */
export function startSkillCapture(): Promise<SkillCaptureStartOutcome> {
  return invoke<SkillCaptureStartOutcome>('skill_capture_start', {
    consentRevision: SKILL_CAPTURE_CONSENT_REVISION,
  });
}

export function stopSkillCapture(): Promise<SkillCaptureStatus> {
  return invoke<SkillCaptureStatus>('skill_capture_stop');
}

export function discardSkillCapture(): Promise<SkillCaptureStatus> {
  return invoke<SkillCaptureStatus>('skill_capture_discard');
}

export function saveSkillCapture(): Promise<SkillCaptureRecording> {
  return invoke<SkillCaptureRecording>('skill_capture_save');
}

export function openScreenRecordingSettings(): Promise<unknown> {
  return invoke<unknown>('system_permission_open', { permission: 'screen-recording' });
}

export function isUnknownCommand(cause: unknown): boolean {
  return cause instanceof DesktopRuntimeError && cause.code === 'unknown-command';
}
