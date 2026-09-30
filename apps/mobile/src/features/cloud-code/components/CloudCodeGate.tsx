import { View } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Code2 } from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

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
          accessibilityLabel="Go back"
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
          style={{
            marginTop: 20,
            color: colors.textPrimary,
            fontSize: typeScale.title3,
            fontWeight: '700',
            textAlign: 'center',
          }}
        >
          AGI Code sessions run in AGI Cloud
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
          Local Mode stays on this device. Switch to AGI Cloud to follow the coding sessions on your
          account and answer anything waiting on you.
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
