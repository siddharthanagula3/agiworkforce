/**
 * FeatureUnavailable — friendly fallback for routes that are gated OFF in this
 * build (`lib/v1FeatureFlags.ts`).
 *
 * Why: several route screens previously did `if (!FEATURES.x) return null`. A
 * `null` route renders a BLANK screen, so a deep link / push tap / direct URL
 * to a disabled feature stranded the user on nothing. Rendering this instead
 * guarantees there is never a blank screen, and gives a clear way back.
 *
 * In-app navigation never links to these routes (they are orphaned while the
 * flag is off); this is purely defence-in-depth for external entry points.
 */
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Sparkles, ArrowLeft } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';

interface FeatureUnavailableProps {
  /** Human-readable feature name, e.g. "Scheduled tasks". */
  feature?: string;
}

export function FeatureUnavailable({ feature }: FeatureUnavailableProps) {
  const c = useThemeColors();
  const router = useRouter();

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)/chat' as Parameters<typeof router.replace>[0]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.surfaceBase }}>
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }}
      >
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: c.neutralSurface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Sparkles size={28} color={c.textMuted} />
        </View>
        <Text
          style={{ color: c.textPrimary, fontSize: 18, fontWeight: '700', textAlign: 'center' }}
        >
          {feature ? `${feature} isn’t available yet` : 'Not available in this version'}
        </Text>
        <Text style={{ color: c.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
          This feature is coming in a future update. It isn’t enabled in this build.
        </Text>
        <Text
          onPress={goBack}
          accessibilityRole="button"
          style={{
            color: c.teal,
            fontSize: 15,
            fontWeight: '600',
            marginTop: 8,
            flexDirection: 'row',
          }}
        >
          <ArrowLeft size={15} color={c.teal} /> Go back
        </Text>
      </View>
    </SafeAreaView>
  );
}

export default FeatureUnavailable;
