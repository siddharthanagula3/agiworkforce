import { useCallback, useRef } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import BottomSheet, { BottomSheetScrollView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import {
  Terminal,
  FileText,
  FilePlus2,
  FilePen,
  Search,
  Globe,
  Folder,
  Image,
  MousePointerClick,
  Plug,
  CircleCheck,
  Loader2,
  ChevronRight,
  Wrench,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/hooks/useTheme';
import type { ToolCall } from '@/types/chat';

// §4.6 icon mapping
function getToolIcon(toolName: string): typeof Terminal {
  const name = toolName.toLowerCase();
  if (name.includes('bash') || name.includes('shell') || name.includes('terminal')) return Terminal;
  if (name.includes('read')) return FileText;
  if (name.includes('write') || name.includes('create')) return FilePlus2;
  if (name.includes('edit') || name.includes('patch')) return FilePen;
  if (name.includes('web_search') || name.includes('search')) return Search;
  if (
    name.includes('fetch') ||
    name.includes('browse') ||
    name.includes('url') ||
    name.includes('http')
  )
    return Globe;
  if (name.includes('list') || name.includes('dir') || name.includes('folder')) return Folder;
  if (name.includes('image') || name.includes('gen')) return Image;
  if (name.includes('browser') || name.includes('click')) return MousePointerClick;
  if (name.includes('mcp') || name.includes('plugin')) return Plug;
  return Wrench;
}

// §4.4 state label
function getStatusLabel(status: ToolCall['status']): string | null {
  switch (status) {
    case 'running':
      return 'Running';
    case 'failed':
      return 'Error';
    default:
      return null;
  }
}

interface InlineToolCallProps {
  toolCall: ToolCall;
}

export function InlineToolCall({ toolCall }: InlineToolCallProps) {
  const colors = useThemeColors();
  const sheetRef = useRef<BottomSheet>(null);
  const chevronRotation = useSharedValue(0);

  const hasBody = Boolean(toolCall.input || toolCall.output || toolCall.command);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronRotation.value}deg` }],
  }));

  const handleBarPress = useCallback(() => {
    if (!hasBody) return;
    chevronRotation.value = withTiming(chevronRotation.value === 0 ? 90 : 0, { duration: 160 });
    sheetRef.current?.expand();
  }, [hasBody, chevronRotation]);

  const handleSheetClose = useCallback(() => {
    chevronRotation.value = withTiming(0, { duration: 160 });
  }, [chevronRotation]);

  const ToolIcon = getToolIcon(toolCall.name);
  const statusLabel = getStatusLabel(toolCall.status);

  const iconColor =
    toolCall.status === 'failed'
      ? colors.agentError
      : toolCall.status === 'running'
        ? colors.agentActive
        : colors.textMuted;

  const labelColor = toolCall.status === 'failed' ? colors.agentError : colors.textSecondary;

  return (
    <>
      {/* Borderless bar per §4 — no background, no card border */}
      <Pressable
        onPress={handleBarPress}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          height: 32,
          paddingHorizontal: 4,
          borderRadius: 6,
        }}
        accessible={true}
        accessibilityLabel={`Tool call: ${toolCall.name}`}
        accessibilityRole="button"
        accessibilityHint={hasBody ? 'Double tap to expand details' : undefined}
      >
        {/* Leading icon — spinner when running, tool icon otherwise */}
        {toolCall.status === 'running' ? (
          <Loader2 size={16} strokeWidth={1.75} color={colors.agentActive} />
        ) : toolCall.status === 'completed' ? (
          <CircleCheck size={16} strokeWidth={1.75} color={colors.textMuted} />
        ) : (
          <ToolIcon size={16} strokeWidth={1.75} color={iconColor} />
        )}

        {/* Tool name */}
        <Text style={{ fontSize: 13, color: labelColor, flex: 1 }} numberOfLines={1}>
          {toolCall.name}
          {statusLabel ? `: ${statusLabel}` : ''}
          {toolCall.filePath ? ` ${toolCall.filePath}` : ''}
        </Text>

        {/* Trailing chevron — only when expandable */}
        {hasBody && (
          <Animated.View style={chevronStyle}>
            <ChevronRight size={14} strokeWidth={2} color={colors.textMuted} />
          </Animated.View>
        )}
      </Pressable>

      {/* Expanded body as bottom-sheet per mobile §10 override */}
      {hasBody && (
        <BottomSheet
          ref={sheetRef}
          index={-1}
          snapPoints={['50%', '90%']}
          enablePanDownToClose
          onClose={handleSheetClose}
          backdropComponent={(props) => (
            <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
          )}
          backgroundStyle={{ backgroundColor: colors.surfaceOverlay }}
          handleIndicatorStyle={{ backgroundColor: colors.textMuted }}
        >
          <BottomSheetScrollView contentContainerStyle={{ padding: 16 }}>
            {/* Sheet header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <ToolIcon size={16} strokeWidth={1.75} color={colors.textMuted} />
              <Text
                style={{ fontSize: 14, fontWeight: '500', color: colors.textPrimary, flex: 1 }}
                numberOfLines={1}
              >
                {toolCall.name}
              </Text>
            </View>

            {/* Command line */}
            {toolCall.command && (
              <View style={{ marginBottom: 12 }}>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '600',
                    color: colors.textMuted,
                    marginBottom: 6,
                    textTransform: 'uppercase',
                    letterSpacing: 0.6,
                  }}
                >
                  Command
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <Text
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 12,
                      color: colors.agentSuccess,
                      backgroundColor: colors.surfaceBase,
                      padding: 10,
                      borderRadius: 6,
                    }}
                  >
                    $ {toolCall.command}
                  </Text>
                </ScrollView>
              </View>
            )}

            {/* Input */}
            {toolCall.input && (
              <View style={{ marginBottom: 12 }}>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '600',
                    color: colors.textMuted,
                    marginBottom: 6,
                    textTransform: 'uppercase',
                    letterSpacing: 0.6,
                  }}
                >
                  Request
                </Text>
                <View
                  style={{
                    backgroundColor: colors.surfaceBase,
                    borderWidth: 1,
                    borderColor: colors.borderLight,
                    borderRadius: 8,
                    padding: 12,
                  }}
                >
                  <Text
                    style={{ fontFamily: 'monospace', fontSize: 12, color: colors.textPrimary }}
                  >
                    {toolCall.input}
                  </Text>
                </View>
              </View>
            )}

            {/* Output */}
            {toolCall.output && (
              <View>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '600',
                    color: colors.textMuted,
                    marginBottom: 6,
                    textTransform: 'uppercase',
                    letterSpacing: 0.6,
                  }}
                >
                  Response
                </Text>
                <View
                  style={{
                    backgroundColor: colors.surfaceBase,
                    borderWidth: 1,
                    borderColor: colors.borderLight,
                    borderRadius: 8,
                    padding: 12,
                  }}
                >
                  <Text
                    style={{ fontFamily: 'monospace', fontSize: 12, color: colors.textPrimary }}
                  >
                    {toolCall.output}
                  </Text>
                </View>
              </View>
            )}
          </BottomSheetScrollView>
        </BottomSheet>
      )}
    </>
  );
}
