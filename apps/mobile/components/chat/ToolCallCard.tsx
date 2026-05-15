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
  Terminal,
  FileText,
  Edit3,
  Globe,
  Code,
  Wrench,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/hooks/useTheme';
import type { ToolCall } from '@/types/chat';

interface ToolCallCardProps {
  toolCall: ToolCall;
}

/** Map tool name patterns to a representative lucide icon. */
function getToolIcon(toolName: string): typeof Terminal {
  const name = toolName.toLowerCase();
  if (name.includes('bash') || name.includes('shell') || name.includes('terminal')) {
    return Terminal;
  }
  if (name.includes('read_file') || name.includes('read') || name.includes('file_text')) {
    return FileText;
  }
  if (name.includes('write_file') || name.includes('edit') || name.includes('create_file')) {
    return Edit3;
  }
  if (
    name.includes('web_search') ||
    name.includes('browse') ||
    name.includes('url') ||
    name.includes('http')
  ) {
    return Globe;
  }
  if (name.includes('code') || name.includes('exec') || name.includes('python')) {
    return Code;
  }
  return Wrench;
}

function StatusIcon({ status }: { status: ToolCall['status'] }) {
  const colors = useThemeColors();
  switch (status) {
    case 'running':
      return <Loader2 size={13} color={colors.agentActive} />;
    case 'completed':
      return <CheckCircle2 size={13} color={colors.agentSuccess} />;
    case 'failed':
      return <XCircle size={13} color={colors.agentError} />;
  }
}

function StatusPill({ status }: { status: ToolCall['status'] }) {
  const colors = useThemeColors();
  const config = {
    running: { label: 'Running', bg: `${colors.agentActive}18`, fg: colors.agentActive },
    completed: { label: 'Done', bg: `${colors.agentSuccess}18`, fg: colors.agentSuccess },
    failed: { label: 'Failed', bg: `${colors.agentError}18`, fg: colors.agentError },
  }[status] ?? { label: status, bg: 'rgba(255,255,255,0.08)', fg: colors.textMuted };

  return (
    <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: config.bg }}>
      <Text className="text-[10px] font-medium" style={{ color: config.fg }}>
        {config.label}
      </Text>
    </View>
  );
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
  const colors = useThemeColors();
  const [expanded, setExpanded] = useState(false);

  const hasIO = Boolean(toolCall.input || toolCall.output);
  const ToolIcon = getToolIcon(toolCall.name);

  const toggleExpanded = useCallback(() => {
    if (hasIO) setExpanded((prev) => !prev);
  }, [hasIO]);

  return (
    <Animated.View entering={FadeInDown.duration(300).springify()}>
      <View
        className="rounded-xl overflow-hidden my-1"
        style={{
          backgroundColor: colors.surfaceOverlay,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.07)',
        }}
      >
        {/* Header row */}
        <Pressable
          onPress={toggleExpanded}
          className="flex-row items-center px-3 py-2.5"
          accessible={true}
          accessibilityLabel={`Tool call: ${toolCall.name}`}
          accessibilityRole="button"
          accessibilityHint={hasIO ? 'Double tap to expand details' : undefined}
        >
          {/* Status dot */}
          <StatusIcon status={toolCall.status} />

          {/* Tool-type icon */}
          <ToolIcon size={13} color={colors.textMuted} style={{ marginLeft: 6 }} />

          {/* Tool name */}
          <Text className="text-[13px] font-medium text-white flex-1 mx-2" numberOfLines={1}>
            {toolCall.name}
          </Text>

          {/* Status pill */}
          <StatusPill status={toolCall.status} />

          {/* Expand chevron */}
          {hasIO && (
            <View style={{ marginLeft: 6 }}>
              {expanded ? (
                <ChevronDown size={13} color={colors.textMuted} />
              ) : (
                <ChevronRight size={13} color={colors.textMuted} />
              )}
            </View>
          )}
        </Pressable>

        {/* Command line (monospace green) */}
        {toolCall.command ? (
          <View className="px-3 pb-2.5">
            <View
              className="rounded-lg px-2.5 py-2"
              style={{ backgroundColor: 'rgba(0,0,0,0.25)' }}
            >
              <Text
                variant="mono"
                className="text-[11px] text-emerald-400"
                numberOfLines={expanded ? undefined : 2}
              >
                $ {toolCall.command}
              </Text>
            </View>
          </View>
        ) : null}

        {/* File path */}
        {toolCall.filePath ? (
          <View className="flex-row items-center gap-1.5 px-3 pb-2.5">
            <FileCode size={11} color={colors.textMuted} />
            <Text variant="caption" className="text-white/40 text-[11px]" numberOfLines={1}>
              {toolCall.filePath}
            </Text>
          </View>
        ) : null}

        {/* Expandable I/O section */}
        {expanded && hasIO ? (
          <View
            className="mx-3 mb-3 rounded-lg overflow-hidden"
            style={{
              backgroundColor: 'rgba(0,0,0,0.2)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.05)',
            }}
          >
            {toolCall.input ? (
              <View className="px-3 py-2.5">
                <Text className="text-[10px] font-semibold uppercase tracking-wider text-white/30 mb-1.5">
                  Input
                </Text>
                <Text variant="mono" className="text-[11px] text-white/60">
                  {toolCall.input}
                </Text>
              </View>
            ) : null}

            {toolCall.input && toolCall.output ? (
              <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.05)' }} />
            ) : null}

            {toolCall.output ? (
              <View className="px-3 py-2.5">
                <Text className="text-[10px] font-semibold uppercase tracking-wider text-white/30 mb-1.5">
                  Output
                </Text>
                <Text variant="mono" className="text-[11px] text-white/60">
                  {toolCall.output}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Footer: duration */}
        {toolCall.duration != null && toolCall.status !== 'running' ? (
          <View className="flex-row items-center gap-1 px-3 pb-2">
            <Clock size={10} color={colors.textMuted} />
            <Text className="text-[10px] text-white/30">{formatDuration(toolCall.duration)}</Text>
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}
