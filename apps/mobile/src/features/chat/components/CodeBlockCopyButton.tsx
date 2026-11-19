import { useCallback } from 'react';
import { PressableBox } from '@/components/ui/PressableBox';
import { Copy, Check, TriangleAlert } from 'lucide-react-native';
import { copyControlLabel, useCopyAction } from '@/src/shared/hooks/useCopyAction';
import { FULL_SCREEN_TOUCH_TARGET } from '@/src/features/chat/chrome/fullScreenChrome';
import { useThemeColors } from '@/src/ui/theme';

const CODE_HEADER_BUTTON_STYLE = {
  minWidth: FULL_SCREEN_TOUCH_TARGET,
  minHeight: FULL_SCREEN_TOUCH_TARGET,
  alignItems: 'center',
  justifyContent: 'center',
} as const;

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
    <PressableBox
      onPress={handleCopy}
      style={CODE_HEADER_BUTTON_STYLE}
      accessibilityLabel={copyControlLabel(status, 'Copy code')}
      accessibilityLiveRegion="polite"
      accessibilityRole="button"
    >
      <Icon size={14} color={iconColor} />
    </PressableBox>
  );
}
