import { View } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Code2 } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { CLOUD_CODE_SCREEN_TITLE } from '../presentation';

interface CloudCodeGateProps {
  signedIn: boolean;
  onBack: () => void;
  onContinue: () => void;
}

export function CloudCodeGate({ signedIn, onBack, onContinue }: CloudCodeGateProps) {
  const colors = useThemeColors();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
      <View style={{ minHeight: 52, justifyContent: 'center', paddingHorizontal: 10 }}>
        <PressableBox
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back to chat"
          hitSlop={8}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <ArrowLeft size={20} color={colors.textSecondary} />
        </PressableBox>
      </View>
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}
      >
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 24,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.accentSurface,
          }}
        >
          <Code2 size={32} color={colors.textPrimary} />
        </View>
        <Text
          accessibilityRole="header"
          style={{
            marginTop: 20,
            color: colors.textPrimary,
            fontSize: typeScale.title3,
            fontWeight: '700',
            textAlign: 'center',
          }}
        >
          {CLOUD_CODE_SCREEN_TITLE}
        </Text>
        <Text
          style={{
            marginTop: 9,
            color: colors.textSecondary,
            fontSize: typeScale.subhead,
            lineHeight: 21,
            textAlign: 'center',
          }}
        >
          Start a cloud coding task or follow a session on a paired computer.
        </Text>
        <Button
          title={signedIn ? 'Switch to AGI Cloud' : 'Sign in to AGI Cloud'}
          onPress={onContinue}
          size="lg"
          accessibilityHint="Opens Cloud access without sending Local Mode data"
          style={{ marginTop: 24, minWidth: 210 }}
        />
      </View>
    </SafeAreaView>
  );
}
