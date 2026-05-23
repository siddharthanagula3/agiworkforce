import { useState, useCallback, useEffect } from 'react';
import { View, Pressable } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
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
import { useThemeColors } from '@/src/ui/theme';
import type { ToolCall } from '@/types/chat';

interface ToolCallCardProps {
  toolCall: ToolCall;
  /** When true, draw the connecting rail line above this card. */
  showRailAbove?: boolean;
  /** When true, draw the connecting rail line below this card. */
  showRailBelow?: boolean;
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

/** Pulsing dot for the running state — mirrors StatusStep.tsx PulsingIndicator. */
function PulsingDot({ color }: { color: string }) {
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View style={{ width: 8, height: 8 }}>
      <View
        style={{
          position: 'absolute',
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: color,
        }}
      />
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: color,
          },
          pulseStyle,
        ]}
      />
    </View>
  );
}

/** The circular node shown on the left rail — status-aware. */
function RailNode({
  status,
  colors,
}: {
  status: ToolCall['status'];
  colors: ReturnType<typeof useThemeColors>;
}) {
  if (status === 'running') {
    return (
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: `${colors.agentActive}18`,
          borderWidth: 1.5,
          borderColor: colors.agentActive,
        }}
      >
        <PulsingDot color={colors.agentActive} />
      </View>
    );
  }
  if (status === 'completed') {
    return (
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: `${colors.agentSuccess}14`,
          borderWidth: 1.5,
          borderColor: `${colors.agentSuccess}60`,
        }}
      >
        <CheckCircle2 size={12} color={colors.agentSuccess} />
      </View>
    );
  }
  // failed
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: `${colors.agentError}14`,
        borderWidth: 1.5,
        borderColor: `${colors.agentError}60`,
      }}
    >
      <XCircle size={12} color={colors.agentError} />
    </View>
  );
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

export function ToolCallCard({
  toolCall,
  showRailAbove = false,
  showRailBelow = false,
}: ToolCallCardProps) {
  const colors = useThemeColors();
  const [expanded, setExpanded] = useState(false);

  const hasIO = Boolean(toolCall.input || toolCall.output);
  const ToolIcon = getToolIcon(toolCall.name);

  const toggleExpanded = useCallback(() => {
    if (hasIO) setExpanded((prev) => !prev);
  }, [hasIO]);

  // Rail line colour — muted when completed, active when running
  const railColor =
    toolCall.status === 'running'
      ? `${colors.agentActive}50`
      : toolCall.status === 'failed'
        ? `${colors.agentError}30`
        : `${colors.textMuted}30`;

  return (
    <Animated.View entering={FadeInDown.duration(300).springify()}>
      <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
        {/* ── Left rail column ─────────────────────────────────────── */}
        <View style={{ width: 36, alignItems: 'center' }}>
          {/* Line above the node */}
          {showRailAbove && (
            <View style={{ flex: 1, width: 2, backgroundColor: railColor, minHeight: 8 }} />
          )}
          {!showRailAbove && <View style={{ height: 10 }} />}

          {/* Status node */}
          <RailNode status={toolCall.status} colors={colors} />

          {/* Line below the node */}
          {showRailBelow && (
            <View style={{ flex: 1, width: 2, backgroundColor: railColor, minHeight: 8 }} />
          )}
          {!showRailBelow && <View style={{ height: 10 }} />}
        </View>

        {/* ── Card body ────────────────────────────────────────────── */}
        <View
          className="flex-1 rounded-xl overflow-hidden my-1 mr-1"
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
            {/* Tool-type icon */}
            <ToolIcon size={13} color={colors.textMuted} style={{ marginRight: 6 }} />

            {/* Tool name */}
            <Text className="text-[13px] font-medium text-white flex-1 mr-2" numberOfLines={1}>
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
      </View>
    </Animated.View>
  );
}
