import { useCallback, useRef } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import BottomSheet, { BottomSheetScrollView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { CircleCheck, Loader2, CircleX, ChevronRight } from 'lucide-react-native';
import { lucideRNToolIcon } from './toolIconRN';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import type { ToolCall } from '@/types/chat';

// §4.4 state label
function getStatusLabel(status: ToolCall['status']): string | null {
  switch (status) {
    case 'running':
      return 'Running';
    case 'completed':
      return 'Done';
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

  const ToolIcon = lucideRNToolIcon(toolCall.name);
  const statusLabel = getStatusLabel(toolCall.status);

  const iconColor =
    toolCall.status === 'failed'
      ? colors.agentError
      : toolCall.status === 'running'
        ? colors.agentActive
        : colors.textMuted;

  const labelColor = toolCall.status === 'failed' ? colors.agentError : colors.textSecondary;

  const statusTone =
    toolCall.status === 'failed'
      ? colors.agentError
      : toolCall.status === 'running'
        ? colors.agentActive
        : colors.agentSuccess;

  return (
    <>
      <Pressable
        onPress={handleBarPress}
        style={{
          flexDirection: 'row',
          alignItems: 'stretch',
          gap: 9,
          minHeight: 38,
          paddingHorizontal: 2,
          paddingVertical: 4,
          borderRadius: 8,
        }}
        accessible={true}
        accessibilityLabel={`Tool call: ${toolCall.name}`}
        accessibilityRole="button"
        accessibilityHint={hasBody ? 'Double tap to expand details' : undefined}
      >
        <View style={{ width: 22, alignItems: 'center' }}>
          <View style={{ flex: 1, width: 1.5, backgroundColor: `${statusTone}38`, minHeight: 5 }} />
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: `${statusTone}14`,
              borderWidth: 1,
              borderColor: `${statusTone}55`,
            }}
          >
            {toolCall.status === 'running' ? (
              <Loader2 size={13} strokeWidth={1.75} color={colors.agentActive} />
            ) : toolCall.status === 'completed' ? (
              <CircleCheck size={13} strokeWidth={1.75} color={colors.agentSuccess} />
            ) : (
              <CircleX size={13} strokeWidth={1.75} color={colors.agentError} />
            )}
          </View>
          <View style={{ flex: 1, width: 1.5, backgroundColor: `${statusTone}22`, minHeight: 5 }} />
        </View>

        <View style={{ flex: 1, justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <ToolIcon size={15} strokeWidth={1.75} color={iconColor} />
            <Text
              style={{ fontSize: 13, color: labelColor, flex: 1, fontWeight: '600' }}
              numberOfLines={1}
            >
              {toolCall.name}
              {toolCall.filePath ? ` ${toolCall.filePath}` : ''}
            </Text>
            {statusLabel ? (
              <View
                style={{
                  borderRadius: 999,
                  backgroundColor: `${statusTone}14`,
                  paddingHorizontal: 7,
                  paddingVertical: 2,
                }}
              >
                <Text style={{ color: statusTone, fontSize: 10, fontWeight: '700' }}>
                  {statusLabel}
                </Text>
              </View>
            ) : null}
            {hasBody ? (
              <Animated.View style={chevronStyle}>
                <ChevronRight size={14} strokeWidth={2} color={colors.textMuted} />
              </Animated.View>
            ) : null}
          </View>
          {toolCall.command ? (
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
              {toolCall.command}
            </Text>
          ) : null}
        </View>
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
