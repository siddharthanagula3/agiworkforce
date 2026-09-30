import { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { useRouter } from 'expo-router';
import { Bot } from 'lucide-react-native';
import type { CloudAgentRun } from '@agiworkforce/cloud-contracts';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { createMobileCloudAgentRunClient } from '@/services/streaming';
import { describeCloudRunError } from '@/src/features/tasks/service';
import {
  ALL_CLOUD_RUN_STATES,
  CLOUD_RUN_STATE_LABELS,
  cloudRunStateColor,
  cloudRunTimeLabel,
} from '@/src/features/tasks/runPresentation';

const PROJECT_WORK_PAGE_LIMIT = 50;

interface ProjectWorkTabProps {
  projectId: string;
  projectName: string;
}

interface WorkState {
  runs: CloudAgentRun[];
  status: 'loading' | 'loaded' | 'error';
  error: string | null;
}

export function ProjectWorkTab({ projectId, projectName }: ProjectWorkTabProps) {
  const colors = useThemeColors();
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<WorkState>({ runs: [], status: 'loading', error: null });

  useEffect(() => {
    const controller = new AbortController();
    setState({ runs: [], status: 'loading', error: null });
    createMobileCloudAgentRunClient()
      .listRuns({
        projectId,
        states: [...ALL_CLOUD_RUN_STATES],
        limit: PROJECT_WORK_PAGE_LIMIT,
        signal: controller.signal,
      })
      .then((page) => {
        if (controller.signal.aborted) return;
        setState({ runs: page.runs, status: 'loaded', error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          runs: [],
          status: 'error',
          error: describeCloudRunError(error, 'Could not load this project’s work'),
        });
      });
    return () => controller.abort();
  }, [projectId, attempt]);

  const handleOpen = useCallback(
    (conversationId: string) => {
      router.push({ pathname: '/(app)/chat/[id]' as const, params: { id: conversationId } });
    },
    [router],
  );

  if (state.status === 'loading') {
    return (
      <View className="items-center justify-center py-16" accessibilityLabel="Loading work">
        <ActivityIndicator size="small" color={colors.teal} />
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View className="items-center justify-center py-16 px-6">
        <Text
          className="text-[13px] text-center leading-[19px] mb-4"
          style={{ color: colors.textSecondary }}
          accessibilityRole="alert"
        >
          {state.error}
        </Text>
        <PressableBox
          onPress={() => setAttempt((value) => value + 1)}
          className="px-5 py-2.5 rounded-xl"
          style={{
            backgroundColor: `${colors.teal}18`,
            borderWidth: 1,
            borderColor: `${colors.teal}35`,
          }}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          <Text className="text-[13px] font-semibold" style={{ color: colors.teal }}>
            Try again
          </Text>
        </PressableBox>
      </View>
    );
  }

  if (state.runs.length === 0) {
    return (
      <View className="items-center justify-center py-16 px-6">
        <View
          className="w-16 h-16 rounded-2xl items-center justify-center mb-4"
          style={{ backgroundColor: `${colors.textMuted}14` }}
        >
          <Bot size={28} color={colors.textMuted} />
        </View>
        <Text
          className="text-[15px] font-semibold text-center mb-2"
          style={{ color: colors.textPrimary }}
        >
          No work yet
        </Text>
        <Text
          className="text-[13px] text-center leading-[19px]"
          style={{ color: colors.textSecondary }}
        >
          Switch a chat in {projectName} to AGI Work and its runs will be listed here.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      {state.runs.map((run) => {
        const title = run.conversationTitle?.trim() || 'Untitled run';
        const runState = run.workState ?? run.state;
        const timeLabel = cloudRunTimeLabel(run);
        const conversationId = run.conversationId;
        return (
          <PressableBox
            key={run.id}
            disabled={!conversationId}
            onPress={() => {
              if (conversationId) handleOpen(conversationId);
            }}
            className="flex-row items-center gap-3 px-4 py-3 rounded-xl mb-2 active:opacity-75"
            style={{
              minHeight: 44,
              backgroundColor: colors.surfaceElevated,
              borderWidth: 1,
              borderColor: colors.border,
            }}
            accessibilityRole="button"
            accessibilityLabel={`${title}, ${CLOUD_RUN_STATE_LABELS[runState]}`}
            accessibilityState={{ disabled: !conversationId }}
          >
            <Bot size={16} color={colors.textMuted} />
            <View className="flex-1">
              <Text
                className="text-[14px] font-medium"
                style={{ color: colors.textPrimary }}
                numberOfLines={1}
              >
                {title}
              </Text>
              {timeLabel ? (
                <Text className="text-xs mt-0.5" style={{ color: colors.textMuted }}>
                  {timeLabel}
                </Text>
              ) : null}
            </View>
            <Text className="text-[12px]" style={{ color: cloudRunStateColor(runState, colors) }}>
              {CLOUD_RUN_STATE_LABELS[runState]}
            </Text>
          </PressableBox>
        );
      })}
    </ScrollView>
  );
}
