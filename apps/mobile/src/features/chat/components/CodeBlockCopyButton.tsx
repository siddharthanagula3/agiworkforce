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
 * Copy control for the code-card header row.
 * Tapping copies the code to clipboard and briefly shows a checkmark.
 *
 * Laid out in normal flow (PAR-M40) — it used to be `position: 'absolute'`
 * over the code body, which forced 28pt of blank reserved padding above every
 * block and left no room for the language label the card now carries.
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
      // The glyph is 14pt inside 4pt of padding; hitSlop takes the tap target
      // to ~38pt without widening the header row.
      hitSlop={8}
      style={{
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
