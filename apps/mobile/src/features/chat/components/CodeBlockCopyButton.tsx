import { useCallback } from 'react';
import { Pressable } from 'react-native';
import { Copy, Check, TriangleAlert } from 'lucide-react-native';
import { copyControlLabel, useCopyAction } from '@/src/shared/hooks/useCopyAction';
import { useThemeColors } from '@/src/ui/theme';

interface CodeBlockCopyButtonProps {
  code: string;
}

export function CodeBlockCopyButton({ code }: CodeBlockCopyButtonProps) {
  const colors = useThemeColors();
  const { status, copy } = useCopyAction();

  const handleCopy = useCallback(() => {
    void copy(code);
  }, [code, copy]);

  const Icon = status === 'copied' ? Check : status === 'failed' ? TriangleAlert : Copy;
  const iconColor =
    status === 'copied'
      ? colors.agentSuccess
      : status === 'failed'
        ? colors.agentError
        : colors.textMuted;

  return (
    <Pressable
      onPress={handleCopy}
      hitSlop={8}
      style={{
        padding: 4,
        borderRadius: 4,
        backgroundColor: colors.neutralSurface,
      }}
      accessibilityLabel={copyControlLabel(status, 'Copy code')}
      accessibilityRole="button"
    >
      <Icon size={14} color={iconColor} />
    </Pressable>
  );
}
