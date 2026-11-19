import { useCallback } from 'react';
import { Share, View } from 'react-native';
import { Check, Copy, Share as ShareIcon, TriangleAlert } from 'lucide-react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { copyControlLabel, useCopyAction } from '@/src/shared/hooks/useCopyAction';
import { useThemeColors } from '@/src/ui/theme';

const ICON_HIT_SLOP = 15;

export function ToolDetailActions({
  text,
  part,
  testID,
}: {
  text: string;
  part: 'request' | 'result' | 'output' | 'error';
  testID?: string;
}) {
  const colors = useThemeColors();
  const { status, copy } = useCopyAction();

  const handleCopy = useCallback(() => {
    void copy(text);
  }, [copy, text]);

  const handleShare = useCallback(() => {
    void Share.share({ message: text }).catch(() => undefined);
  }, [text]);

  const CopyIcon = status === 'copied' ? Check : status === 'failed' ? TriangleAlert : Copy;
  const copyColor =
    status === 'copied'
      ? colors.agentSuccess
      : status === 'failed'
        ? colors.agentError
        : colors.textMuted;

  return (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
      <PressableBox
        testID={testID ? `${testID}.copy` : undefined}
        onPress={handleCopy}
        hitSlop={ICON_HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={copyControlLabel(status, `Copy ${part}`)}
      >
        <CopyIcon size={14} color={copyColor} />
      </PressableBox>
      <PressableBox
        testID={testID ? `${testID}.share` : undefined}
        onPress={handleShare}
        hitSlop={ICON_HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={`Share ${part}`}
      >
        <ShareIcon size={14} color={colors.textMuted} />
      </PressableBox>
    </View>
  );
}
