import { useState, useCallback } from 'react';
import { Pressable } from 'react-native';
import { Copy, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { copyToClipboard } from '@/lib/clipboard';
import { useSettingsStore } from '@/stores/settingsStore';
import { useThemeColors } from '@/src/ui/theme';

interface CodeBlockCopyButtonProps {
  code: string;
}

/**
 * Floating copy button rendered inside a code block.
 * Tapping copies the code to clipboard and briefly shows a checkmark.
 */
export function CodeBlockCopyButton({ code }: CodeBlockCopyButtonProps) {
  const colors = useThemeColors();
  const [copied, setCopied] = useState(false);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  const handleCopy = useCallback(async () => {
    const success = await copyToClipboard(code);
    if (success && hapticsEnabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [code, hapticsEnabled]);

  return (
    <Pressable
      onPress={handleCopy}
      style={{
        position: 'absolute',
        top: 6,
        right: 6,
        padding: 4,
        borderRadius: 4,
        backgroundColor: colors.neutralSurface,
      }}
      accessibilityLabel={copied ? 'Copied' : 'Copy code'}
      accessibilityRole="button"
    >
      {copied ? (
        <Check size={14} color={colors.agentSuccess} />
      ) : (
        <Copy size={14} color={colors.textMuted} />
      )}
    </Pressable>
  );
}
