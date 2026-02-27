import { View, ScrollView, Pressable, Modal } from 'react-native';
import * as Haptics from 'expo-haptics';
import { X, Copy, Check, Code2, Mail, BookOpen, Image as ImageIcon, FileText, BarChart3 } from 'lucide-react-native';
import { useState, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { Badge } from '@/components/ui/badge';
import { colors } from '@/lib/theme';
import { copyToClipboard } from '@/lib/clipboard';
import type { Artifact } from '@/types/chat';

interface ArtifactFullScreenProps {
  artifact: Artifact | null;
  visible: boolean;
  onClose: () => void;
}

const TYPE_ICONS: Record<Artifact['type'], typeof Code2> = {
  code: Code2,
  email: Mail,
  research: BookOpen,
  image: ImageIcon,
  chart: BarChart3,
  document: FileText,
};

/**
 * Full-screen modal overlay for viewing expanded artifacts.
 * Close button top-right, copy button for code, scroll view for long content.
 */
export function ArtifactFullScreen({ artifact, visible, onClose }: ArtifactFullScreenProps) {
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!artifact) return;
    const success = await copyToClipboard(artifact.content);
    if (success) {
      setCopied(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [artifact]);

  if (!artifact) return null;

  const Icon = TYPE_ICONS[artifact.type];
  const isCode = artifact.type === 'code';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="overFullScreen"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
        }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingTop: insets.top + 8,
            paddingHorizontal: 16,
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            backgroundColor: colors.surfaceBase,
            gap: 12,
          }}
        >
          <Icon size={18} color={colors.textSecondary} />
          <Text
            style={{
              flex: 1,
              fontSize: 16,
              fontWeight: '600',
              color: colors.textPrimary,
            }}
            numberOfLines={1}
          >
            {artifact.title}
          </Text>

          {artifact.language && (
            <Badge label={artifact.language} color="teal" />
          )}

          {/* Copy button (shown for code and text content) */}
          <Pressable
            onPress={handleCopy}
            style={{
              padding: 8,
              borderRadius: 8,
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
            }}
            accessibilityLabel="Copy content"
            accessibilityRole="button"
          >
            {copied ? (
              <Check size={18} color={colors.agentSuccess} />
            ) : (
              <Copy size={18} color={colors.textSecondary} />
            )}
          </Pressable>

          {/* Close button */}
          <Pressable
            onPress={onClose}
            style={{
              padding: 8,
              borderRadius: 8,
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
            }}
            accessibilityLabel="Close"
            accessibilityRole="button"
          >
            <X size={18} color={colors.textSecondary} />
          </Pressable>
        </View>

        {/* Content */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 24,
          }}
          showsVerticalScrollIndicator
        >
          {/* Email metadata header */}
          {artifact.type === 'email' && artifact.metadata != null && (
            <View
              style={{
                marginBottom: 16,
                padding: 12,
                borderRadius: 8,
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                gap: 4,
              }}
            >
              {artifact.metadata.from != null && (
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                  <Text style={{ fontWeight: '600', color: colors.textPrimary }}>{'From: '}</Text>
                  {String(artifact.metadata.from)}
                </Text>
              )}
              {artifact.metadata.to != null && (
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                  <Text style={{ fontWeight: '600', color: colors.textPrimary }}>{'To: '}</Text>
                  {String(artifact.metadata.to)}
                </Text>
              )}
              {artifact.metadata.subject != null && (
                <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                  <Text style={{ fontWeight: '600', color: colors.textPrimary }}>{'Subject: '}</Text>
                  {String(artifact.metadata.subject)}
                </Text>
              )}
            </View>
          )}

          {/* Main content */}
          <View
            style={
              isCode
                ? {
                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                    borderRadius: 8,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }
                : undefined
            }
          >
            <Text
              style={{
                fontSize: isCode ? 13 : 15,
                lineHeight: isCode ? 20 : 24,
                color: colors.textPrimary,
                fontFamily: isCode ? 'Menlo' : undefined,
              }}
              selectable
            >
              {artifact.content}
            </Text>
          </View>

          {/* Research citations */}
          {artifact.type === 'research' && artifact.metadata?.citations != null && (
            <View style={{ marginTop: 16 }}>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '600',
                  color: colors.textMuted,
                  marginBottom: 8,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                Citations
              </Text>
              <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 20 }}>
                {String(artifact.metadata.citations)}
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
