import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { MessageSquare, RotateCcw, X, type LucideIcon } from 'lucide-react-native';
import type { MediaJobEntry } from '@agiworkforce/cloud-contracts';
import { isInFlightMediaJobStatus, type MediaJobStatus } from '@agiworkforce/types';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { toUserMessage } from '@/services/userMessage';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { cancelMediaJob, listMediaJobs, retryMediaJob } from './libraryClient';

const POLL_INTERVAL_MS = 5_000;
const ACTION_FAILED_COPY = 'That did not go through. Try again.';

const STATUS_LABEL: Record<MediaJobStatus, string> = {
  queued: 'Queued',
  running: 'Generating',
  failed: 'Failed',
  done: 'Done',
  cancelled: 'Cancelled',
};

const KIND_LABEL: Record<MediaJobEntry['kind'], string> = { image: 'Image', video: 'Video' };

function inFlight(job: MediaJobEntry): boolean {
  return isInFlightMediaJobStatus(job.status);
}

function statusText(job: MediaJobEntry): string {
  return job.status === 'running' && job.progress !== null
    ? `${STATUS_LABEL.running} ${job.progress}%`
    : STATUS_LABEL[job.status];
}

function JobAction({
  label,
  icon: Icon,
  disabled,
  onPress,
}: {
  label: string;
  icon: LucideIcon;
  disabled: boolean;
  onPress: () => void;
}) {
  const c = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={{
        minHeight: 44,
        paddingHorizontal: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Icon size={15} color={c.textSecondary} />
      <Text style={{ color: c.textSecondary, fontSize: typeScale.footnote, fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function MediaJobsSection({
  onOpenConversation,
}: {
  onOpenConversation: (conversationId: string) => void;
}) {
  const c = useThemeColors();
  const [jobs, setJobs] = useState<MediaJobEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const next = await listMediaJobs(signal);
      if (signal?.aborted) return;
      setJobs(next);
      setError(null);
    } catch (loadError) {
      if (signal?.aborted) return;
      setError(toUserMessage(loadError, 'Your generations could not be loaded.'));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const active = jobs?.some(inFlight) === true;
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active, load]);

  const act = useCallback(
    async (job: MediaJobEntry, run: (job: MediaJobEntry) => Promise<void>) => {
      setBusyId(job.id);
      try {
        await run(job);
      } catch (actionError) {
        setError(toUserMessage(actionError, ACTION_FAILED_COPY));
      } finally {
        await load();
        setBusyId(null);
      }
    },
    [load],
  );

  const shown = (jobs ?? []).filter((job) => job.status !== 'done');
  if (shown.length === 0 && error === null) return null;

  return (
    <View testID="library-media-jobs" style={{ marginBottom: 16, gap: 8 }}>
      <Text
        accessibilityRole="header"
        style={{ color: c.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}
      >
        Generations
      </Text>
      {error ? (
        <Text
          accessibilityRole="alert"
          style={{ color: c.agentError, fontSize: typeScale.footnote }}
        >
          {error}
        </Text>
      ) : null}
      {shown.length > 0 ? (
        <View
          style={{
            borderRadius: 14,
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.surfaceElevated,
          }}
        >
          {shown.map((job, index) => {
            const conversationId = job.conversation_id;
            const busy = busyId === job.id;
            return (
              <View
                key={job.id}
                testID={`library-media-job-${job.id}`}
                style={{
                  paddingHorizontal: 12,
                  paddingTop: 10,
                  paddingBottom: 4,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: c.border,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      numberOfLines={2}
                      style={{ color: c.textPrimary, fontSize: typeScale.subhead }}
                    >
                      {job.prompt}
                    </Text>
                    <Text style={{ color: c.textMuted, fontSize: typeScale.caption }}>
                      {`${KIND_LABEL[job.kind]} · ${job.model} · ${new Date(
                        job.created_at,
                      ).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`}
                    </Text>
                    {job.error ? (
                      <Text style={{ color: c.agentError, fontSize: typeScale.caption }}>
                        {job.error}
                      </Text>
                    ) : null}
                  </View>
                  <View
                    accessibilityLiveRegion="polite"
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                  >
                    {inFlight(job) ? <ActivityIndicator size="small" color={c.textMuted} /> : null}
                    <Text
                      style={{
                        color: job.status === 'failed' ? c.agentError : c.textSecondary,
                        fontSize: typeScale.caption,
                        fontWeight: '600',
                      }}
                    >
                      {statusText(job)}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginLeft: -10 }}>
                  {conversationId ? (
                    <JobAction
                      label="Open chat"
                      icon={MessageSquare}
                      disabled={false}
                      onPress={() => onOpenConversation(conversationId)}
                    />
                  ) : null}
                  {job.retryable ? (
                    <JobAction
                      label="Try again"
                      icon={RotateCcw}
                      disabled={busy}
                      onPress={() => void act(job, retryMediaJob)}
                    />
                  ) : null}
                  {job.cancellable ? (
                    <JobAction
                      label="Cancel"
                      icon={X}
                      disabled={busy}
                      onPress={() => void act(job, cancelMediaJob)}
                    />
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
