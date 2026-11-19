import { Alert, Share } from 'react-native';
import { Check, Copy, Share as ShareIcon, TriangleAlert } from 'lucide-react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { copyControlLabel, useCopyAction } from '@/src/shared/hooks/useCopyAction';

const CONTROL_TARGET = 44;

const TARGET = {
  width: CONTROL_TARGET,
  height: CONTROL_TARGET,
  alignItems: 'center',
  justifyContent: 'center',
} as const;

interface DiagramSourceControlsProps {
  source: string;
  color: string;
  iconSize: number;
}

/** Copy and Share for a diagram's source, as bare symbols with a full-size tap area. */
export function DiagramSourceControls({ source, color, iconSize }: DiagramSourceControlsProps) {
  const { status, copy } = useCopyAction();
  const CopyIcon = status === 'copied' ? Check : status === 'failed' ? TriangleAlert : Copy;
  const share = () => {
    void Share.share({ message: source }).catch(() => {
      Alert.alert(
        'Could not share',
        'Sharing is not available right now. Try again, or copy this.',
      );
    });
  };

  return (
    <>
      <PressableBox
        onPress={() => void copy(source)}
        accessibilityRole="button"
        accessibilityLabel={copyControlLabel(status, 'Copy diagram source')}
        style={TARGET}
      >
        <CopyIcon size={iconSize} color={color} />
      </PressableBox>
      <PressableBox
        onPress={share}
        accessibilityRole="button"
        accessibilityLabel="Share diagram source"
        style={TARGET}
      >
        <ShareIcon size={iconSize} color={color} />
      </PressableBox>
    </>
  );
}
