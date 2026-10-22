'use client';

import { useSyncExternalStore } from 'react';
import {
  SKILL_CAPTURE_LIMITS,
  type SkillCaptureRecording,
  type SkillCaptureStatus,
} from '@agiworkforce/local-runtime-contract';
import { isUnknownCommand, readSkillCapture } from './skill-capture-client';

export type RecorderView = 'none' | 'consent' | 'summary' | 'review';

export interface RecorderState {
  status: SkillCaptureStatus | null;
  supported: boolean;
  view: RecorderView;
  recording: SkillCaptureRecording | null;
  presenter: string | null;
}

const RETENTION_REFRESH_SLACK_MS = 500;

const INITIAL: RecorderState = {
  status: null,
  supported: false,
  view: 'none',
  recording: null,
  presenter: null,
};

let state: RecorderState = INITIAL;
const listeners = new Set<() => void>();
const mounted: string[] = [];
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let reading = false;

function emit(): void {
  for (const listener of listeners) listener();
}

function setState(patch: Partial<RecorderState>): void {
  state = { ...state, ...patch };
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readState(): RecorderState {
  return state;
}

function readServerState(): RecorderState {
  return INITIAL;
}

export function useRecorderState(): RecorderState {
  return useSyncExternalStore(subscribe, readState, readServerState);
}

function clearPoll(): void {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
}

function schedule(status: SkillCaptureStatus): void {
  clearPoll();
  if (mounted.length === 0) return;
  if (status.phase === 'recording') {
    pollTimer = setTimeout(() => void refreshRecorder(), SKILL_CAPTURE_LIMITS.frameIntervalMs);
    return;
  }
  if (status.phase === 'stopped' && status.discardsAt !== null) {
    const wait = Math.max(0, status.discardsAt - Date.now()) + RETENTION_REFRESH_SLACK_MS;
    pollTimer = setTimeout(() => void refreshRecorder(), wait);
  }
}

function nextView(previous: SkillCaptureStatus | null, next: SkillCaptureStatus): RecorderView {
  if (state.view === 'review') return 'review';
  if (next.phase === 'idle') return state.view === 'consent' ? 'consent' : 'none';
  if (next.phase === 'stopped' && previous?.phase === 'recording') return 'summary';
  if (next.phase === 'recording' && state.view === 'consent') return 'none';
  return state.view;
}

export function applyRecorderStatus(next: SkillCaptureStatus): void {
  const previous = state.status;
  setState({ status: next, supported: next.available, view: nextView(previous, next) });
  schedule(next);
}

export async function refreshRecorder(): Promise<void> {
  if (reading) return;
  reading = true;
  try {
    applyRecorderStatus(await readSkillCapture());
  } catch (cause) {
    if (isUnknownCommand(cause)) {
      clearPoll();
      setState({ status: null, supported: false });
    }
  } finally {
    reading = false;
  }
}

function onFocus(): void {
  void refreshRecorder();
}

function presenterFor(owner: string | null): string | null {
  if (owner && mounted.includes(owner)) return owner;
  return mounted[0] ?? null;
}

/**
 * Every composer can open the recorder, but one recording has one set of
 * controls: the composer that asked presents them, or the first one mounted
 * when nobody has asked yet.
 */
export function mountRecorder(id: string): () => void {
  mounted.push(id);
  if (mounted.length === 1) {
    window.addEventListener('focus', onFocus);
    void refreshRecorder();
  }
  setState({ presenter: presenterFor(state.presenter) });
  return () => {
    const index = mounted.indexOf(id);
    if (index >= 0) mounted.splice(index, 1);
    if (mounted.length === 0) {
      window.removeEventListener('focus', onFocus);
      clearPoll();
    }
    setState({ presenter: presenterFor(state.presenter === id ? null : state.presenter) });
  };
}

export function openRecorder(requester: string | null): void {
  const phase = state.status?.phase ?? 'idle';
  const view: RecorderView =
    state.recording !== null
      ? 'review'
      : phase === 'stopped'
        ? 'summary'
        : phase === 'idle'
          ? 'consent'
          : 'none';
  setState({ view, presenter: presenterFor(requester) });
}

export function setRecorderView(view: RecorderView): void {
  setState({ view });
}

export function holdRecording(recording: SkillCaptureRecording | null): void {
  setState({ recording, view: recording ? 'review' : 'none' });
}

export function resetRecorderForTests(): void {
  clearPoll();
  mounted.splice(0, mounted.length);
  if (typeof window !== 'undefined') window.removeEventListener('focus', onFocus);
  reading = false;
  state = INITIAL;
  emit();
}
