import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Sparkles, ArrowLeft, Lock, CreditCard, ShieldOff } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';

export type UnavailableReason = 'unsupported' | 'permission' | 'entitlement' | 'policy';

interface FeatureUnavailableProps {
  feature?: string;
  reason?: UnavailableReason;
}

const REASON_ICONS = {
  unsupported: Sparkles,
  permission: Lock,
  entitlement: CreditCard,
  policy: ShieldOff,
} as const;

function headingFor(reason: UnavailableReason, feature?: string): string {
  const named = feature ?? 'This';
  if (reason === 'permission') return `${named} needs permission you do not have`;
  if (reason === 'entitlement') return `${named} is not on your plan`;
  if (reason === 'policy') return `${named} is turned off for this workspace`;
  return feature ? `${feature} isn’t available yet` : 'Not available in this version';
}

function bodyFor(reason: UnavailableReason): string {
  if (reason === 'permission') {
    return 'Your role in this workspace does not include it. A workspace admin can grant it.';
  }
  if (reason === 'entitlement') {
    return 'It is available on a higher plan. Nothing you have already made is affected.';
  }
  if (reason === 'policy') {
    return 'An administrator turned it off for everyone here. Nothing you have already made is affected.';
  }
  return 'This feature is coming in a future update. It isn’t enabled in this build.';
}

export function FeatureUnavailable({ feature, reason = 'unsupported' }: FeatureUnavailableProps) {
  const c = useThemeColors();
  const router = useRouter();
  const Icon = REASON_ICONS[reason];
  const blocked = reason !== 'unsupported';

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)/chat' as Parameters<typeof router.replace>[0]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.surfaceBase }}>
      <View
        accessibilityLabel={`unavailable-${reason}`}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }}
      >
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: blocked ? c.warningSurface : c.neutralSurface,
            borderWidth: blocked ? 1 : 0,
            borderColor: blocked ? c.warningBorder : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={28} color={c.textMuted} />
        </View>
        <Text
          style={{ color: c.textPrimary, fontSize: 18, fontWeight: '700', textAlign: 'center' }}
        >
          {headingFor(reason, feature)}
        </Text>
        <Text style={{ color: c.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
          {bodyFor(reason)}
        </Text>
        <Pressable
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            marginTop: 8,
          }}
        >
          <ArrowLeft size={15} color={c.teal} />
          <Text style={{ color: c.teal, fontSize: 15, fontWeight: '600' }}>Go back</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

export default FeatureUnavailable;
