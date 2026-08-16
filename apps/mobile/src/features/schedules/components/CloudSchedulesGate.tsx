import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Cloud } from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';

interface CloudSchedulesGateProps {
  signedIn: boolean;
  onBack: () => void;
  onContinue: () => void;
}

export function CloudSchedulesGate({ signedIn, onBack, onContinue }: CloudSchedulesGateProps) {
  const colors = useThemeColors();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
      <View style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 12 }}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
          style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
        >
          <ArrowLeft size={21} color={colors.textSecondary} />
        </Pressable>
      </View>

      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}
      >
        <View
          style={{
            width: 68,
            height: 68,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: `${colors.teal}18`,
          }}
        >
          <Cloud size={30} color={colors.teal} />
        </View>
        <Text
          style={{
            marginTop: 20,
            color: colors.textPrimary,
            fontSize: 21,
            fontWeight: '700',
            textAlign: 'center',
          }}
        >
          Schedules run in AGI Cloud
        </Text>
        <Text
          style={{
            marginTop: 9,
            color: colors.textSecondary,
            fontSize: 14,
            lineHeight: 21,
            textAlign: 'center',
          }}
        >
          Local Mode stays on this device. Only schedules you create here are sent to AGI Cloud and
          run at their selected times.
        </Text>
        <Button
          title={signedIn ? 'Switch to AGI Cloud' : 'Sign in to AGI Cloud'}
          onPress={onContinue}
          size="lg"
          accessibilityHint="Opens Cloud access without sending Local Mode data"
          style={{
            marginTop: 24,
            minWidth: 210,
          }}
        />
      </View>
    </SafeAreaView>
  );
}
