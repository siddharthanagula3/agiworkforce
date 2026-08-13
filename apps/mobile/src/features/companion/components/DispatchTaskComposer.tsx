import { useMemo, useState } from 'react';
import { Activity, Send, Square } from 'lucide-react-native';
import { Pressable, TextInput, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { cancelDispatchTask, sendDispatchTask } from '@/services/companion';
import { useDispatchTaskStore } from '@/stores/dispatchTaskStore';
import { useThemeColors } from '@/src/ui/theme';

const TERMINAL_STATUSES = new Set([
  'ready_for_review',
  'completed',
  'failed',
  'cancelled',
  'rejected',
]);

const STATUS_LABELS: Record<string, string> = {
  sending: 'Sending',
  accepted: 'Accepted',
  queued: 'Queued',
  running: 'Running',
  awaiting_input: 'Needs input',
  ready_for_review: 'Ready for review',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
};

export function DispatchTaskComposer() {
  const colors = useThemeColors();
  const [prompt, setPrompt] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const tasks = useDispatchTaskStore((state) => state.tasks);
  const visibleTasks = useMemo(() => tasks.slice(0, 4), [tasks]);
  const canSend = !isSending && prompt.trim().length > 0 && prompt.trim().length <= 20_000;

  const handleSend = async () => {
    if (!canSend) return;
    setIsSending(true);
    setSendError(null);
    const requestId = await sendDispatchTask({ prompt });
    if (requestId) {
      setPrompt('');
    } else {
      setSendError('Task was not sent. Check the Desktop connection and try again.');
    }
    setIsSending(false);
  };

  return (
    <View className="px-4 mb-3">
      <Card variant="elevated">
        <View className="flex-row items-center gap-2 mb-2">
          <Activity size={15} color={colors.teal} />
          <Text className="text-sm font-medium text-white">Start on Desktop</Text>
        </View>
        <Text className="text-xs text-white/40 mb-3">
          Send a new task to this computer. Desktop privacy and approval rules still apply.
        </Text>

        <View className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <TextInput
            value={prompt}
            onChangeText={setPrompt}
            placeholder="What should Desktop work on?"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={20_000}
            className="min-h-[72px] text-sm text-white"
            style={{ textAlignVertical: 'top' }}
            accessibilityLabel="New Desktop task"
            editable={!isSending}
          />
          <View className="flex-row items-center justify-between pt-2">
            <Text className="text-[10px] text-white/30">{prompt.trim().length}/20,000</Text>
            <Pressable
              onPress={() => void handleSend()}
              disabled={!canSend}
              className={`flex-row items-center gap-1.5 rounded-lg px-3 py-2 ${
                canSend ? '' : 'bg-white/10'
              }`}
              style={
                canSend
                  ? ({ pressed }) => ({
                      backgroundColor: pressed ? colors.textPrimary : colors.teal,
                    })
                  : undefined
              }
              accessibilityRole="button"
              accessibilityLabel="Send task to Desktop"
            >
              <Send size={13} color={canSend ? colors.accentText : colors.textMuted} />
              <Text
                className="text-xs font-semibold"
                style={{ color: canSend ? colors.accentText : colors.textMuted }}
              >
                {isSending ? 'Sending…' : 'Send'}
              </Text>
            </Pressable>
          </View>
          {sendError ? (
            <Text
              className="mt-2 text-xs"
              style={{ color: colors.agentError }}
              accessibilityRole="alert"
            >
              {sendError}
            </Text>
          ) : null}
        </View>

        {visibleTasks.length > 0 && (
          <View className="mt-4 gap-2">
            <Text className="text-[10px] uppercase tracking-wider text-white/40">
              Recent Dispatch tasks
            </Text>
            {visibleTasks.map((task) => {
              const isTerminal = TERMINAL_STATUSES.has(task.status);
              const isError = task.status === 'failed' || task.status === 'rejected';
              return (
                <View
                  key={task.requestId}
                  className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2"
                >
                  <View className="flex-row items-center gap-2">
                    <View
                      className={`h-2 w-2 rounded-full ${
                        isError ? 'bg-red-400' : isTerminal ? 'bg-emerald-400' : 'bg-amber-400'
                      }`}
                    />
                    <Text className="flex-1 text-xs font-medium text-white" numberOfLines={1}>
                      {task.title}
                    </Text>
                    <Text className="text-[10px] text-white/45">
                      {STATUS_LABELS[task.status] ?? task.status}
                    </Text>
                    {!isTerminal && task.status !== 'sending' && (
                      <Pressable
                        onPress={() => void cancelDispatchTask(task.requestId, task.taskId)}
                        className="rounded-md bg-red-500/10 p-1.5 active:bg-red-500/20"
                        accessibilityRole="button"
                        accessibilityLabel={`Cancel ${task.title}`}
                      >
                        <Square size={10} color={colors.agentError} />
                      </Pressable>
                    )}
                  </View>
                  {(task.error || task.message) && (
                    <Text
                      className={`mt-1 text-[10px] ${isError ? 'text-red-300' : 'text-white/40'}`}
                      numberOfLines={2}
                    >
                      {task.error ?? task.message}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </Card>
    </View>
  );
}
