import { useState, useCallback } from 'react';
import { View, Pressable } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  FileCode,
  Clock,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { colors } from '@/lib/theme';
import type { ToolCall } from '@/types/chat';

interface ToolCallCardProps {
  toolCall: ToolCall;
}

const STATUS_BORDER_COLOR: Record<ToolCall['status'], string> = {
  running: colors.agentActive,
  completed: colors.agentSuccess,
  failed: colors.agentError,
};

const STATUS_BADGE: Record<
  ToolCall['status'],
  { label: string; color: 'blue' | 'green' | 'red' }
> = {
  running: { label: 'Running', color: 'blue' },
  completed: { label: 'Completed', color: 'green' },
  failed: { label: 'Failed', color: 'red' },
};

function StatusIcon({ status }: { status: ToolCall['status'] }) {
  switch (status) {
    case 'running':
      return <Loader2 size={14} color={colors.agentActive} />;
    case 'completed':
      return <CheckCircle2 size={14} color={colors.agentSuccess} />;
    case 'failed':
      return <XCircle size={14} color={colors.agentError} />;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);

  const borderColor = STATUS_BORDER_COLOR[toolCall.status];
  const badgeConfig = STATUS_BADGE[toolCall.status];

  const hasIO = Boolean(toolCall.input || toolCall.output);

  const toggleExpanded = useCallback(() => {
    if (hasIO) {
      setExpanded((prev) => !prev);
    }
  }, [hasIO]);

  return (
    <Animated.View entering={FadeInDown.duration(300).springify()}>
      <View
        className="rounded-xl overflow-hidden my-1"
        style={{
          backgroundColor: colors.surfaceOverlay,
          borderLeftWidth: 3,
          borderLeftColor: borderColor,
        }}
      >
        {/* Header */}
        <Pressable
          onPress={toggleExpanded}
          className="flex-row items-center justify-between px-3 py-2.5"
        >
          <View className="flex-row items-center gap-2 flex-1 mr-2">
            <StatusIcon status={toolCall.status} />
            <Text className="text-[13px] font-semibold text-white flex-shrink" numberOfLines={1}>
              {toolCall.name}
            </Text>
            <Badge label={badgeConfig.label} color={badgeConfig.color} />
          </View>

          {hasIO && (
            <View className="flex-row items-center">
              {expanded ? (
                <ChevronDown size={14} color={colors.textMuted} />
              ) : (
                <ChevronRight size={14} color={colors.textMuted} />
              )}
            </View>
          )}
        </Pressable>

        {/* Command line (monospace green) */}
        {toolCall.command ? (
          <View className="px-3 pb-2">
            <View className="bg-black/30 rounded-md px-2.5 py-1.5">
              <Text
                variant="mono"
                className="text-[12px] text-emerald-400"
                numberOfLines={expanded ? undefined : 2}
              >
                $ {toolCall.command}
              </Text>
            </View>
          </View>
        ) : null}

        {/* File path */}
        {toolCall.filePath ? (
          <View className="flex-row items-center gap-1.5 px-3 pb-2">
            <FileCode size={12} color={colors.textMuted} />
            <Text variant="caption" className="text-white/50" numberOfLines={1}>
              {toolCall.filePath}
            </Text>
          </View>
        ) : null}

        {/* Expandable I/O section */}
        {expanded && hasIO ? (
          <View className="px-3 pb-3 gap-2">
            {toolCall.input ? (
              <View>
                <Text variant="caption" className="text-white/40 mb-1 uppercase tracking-wider text-[10px]">
                  Input
                </Text>
                <View className="bg-black/30 rounded-md px-2.5 py-2 max-h-[200px]">
                  <Text variant="mono" className="text-[11px] text-white/70">
                    {toolCall.input}
                  </Text>
                </View>
              </View>
            ) : null}

            {toolCall.output ? (
              <View>
                <Text variant="caption" className="text-white/40 mb-1 uppercase tracking-wider text-[10px]">
                  Output
                </Text>
                <View className="bg-black/30 rounded-md px-2.5 py-2 max-h-[200px]">
                  <Text variant="mono" className="text-[11px] text-white/70">
                    {toolCall.output}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Footer: duration */}
        {toolCall.duration != null && toolCall.status !== 'running' ? (
          <View className="flex-row items-center gap-1 px-3 pb-2">
            <Clock size={10} color={colors.textMuted} />
            <Text variant="caption" className="text-white/40 text-[10px]">
              {formatDuration(toolCall.duration)}
            </Text>
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}
