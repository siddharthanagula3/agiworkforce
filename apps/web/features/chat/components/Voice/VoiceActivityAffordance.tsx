'use client';

import { ChevronRight } from '@agiworkforce/icons';
import type { AgentActivityState } from '@agiworkforce/client-runtime';

const LABEL = {
  stopped: 'Stopped thinking',
  open: 'Open the activity panel for this reply',
} as const;

const MS_PER_SECOND = 1_000;
const MIN_REPORTED_SECONDS = 1;

function activityDurationLabel(activity: AgentActivityState): string {
  const completedAtMs = activity.completedAtMs;
  if (!completedAtMs) return LABEL.stopped;
  const seconds = Math.max(
    Math.round((completedAtMs - activity.startedAtMs) / MS_PER_SECOND),
    MIN_REPORTED_SECONDS,
  );
  return `Thought for ${seconds}s`;
}

export interface VoiceActivityAffordanceProps {
  activity: AgentActivityState;
  onOpen: () => void;
}

export function VoiceActivityAffordance({ activity, onOpen }: VoiceActivityAffordanceProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="voice-activity-affordance"
      aria-label={LABEL.open}
      className="mb-3 flex items-center gap-1 rounded-full text-sm text-[var(--chat-text-muted)] transition-colors hover:text-[var(--chat-text-primary)]"
    >
      {activityDurationLabel(activity)}
      <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}
