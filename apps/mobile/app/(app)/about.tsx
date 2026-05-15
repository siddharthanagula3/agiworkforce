import { useCallback } from 'react';
import { View, ScrollView, Pressable, Alert, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { ArrowLeft, Sparkles, ExternalLink, MessageCircle, Mail, Info } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useThemeColors } from '@/hooks/useTheme';
// Metro's default config supports importing package.json — read versions from
// the manifest so the About screen never drifts from the actual installed deps.
import pkg from '../../package.json';

const APP_VERSION = Constants.expoConfig?.version ?? 'unknown';
const APP_BUILD = (() => {
  const cfg = Constants.expoConfig;
  if (!cfg) return 'unknown';
  if (Platform.OS === 'ios') return `${cfg.version} (${cfg.ios?.buildNumber ?? '?'})`;
  if (Platform.OS === 'android') return `${cfg.version} (${cfg.android?.versionCode ?? '?'})`;
  return cfg.version ?? 'unknown';
})();
const expoVersion = (pkg.dependencies?.expo ?? '').replace(/^[~^]/, '').split('.')[0] || '?';
const rnVersion = pkg.dependencies?.['react-native'] ?? '?';
const RUNTIME = `Expo ${expoVersion} + React Native ${rnVersion}`;

// ---------------------------------------------------------------------------
// Link row
// ---------------------------------------------------------------------------

function LinkRow({
  icon: Icon,
  label,
  onPress,
}: {
  icon: typeof ExternalLink;
  label: string;
  onPress: () => void;
}) {
  const c = useThemeColors();
  return (
    <Pressable
      className="flex-row items-center justify-between py-3 px-1 active:bg-white/5 rounded-lg"
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
    >
      <View className="flex-row items-center gap-3">
        <Icon size={18} color={c.textSecondary} />
        <Text className="text-sm text-white">{label}</Text>
      </View>
      <ExternalLink size={14} color={c.textMuted} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Info row (no press action)
// ---------------------------------------------------------------------------

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between py-2.5 px-1">
      <Text className="text-sm text-white/60">{label}</Text>
      <Text className="text-sm text-white/50">{value}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// About Screen
// ---------------------------------------------------------------------------

export default function AboutScreen() {
  const c = useThemeColors();
  const router = useRouter();

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)/settings' as Parameters<typeof router.replace>[0]);
  }, [router]);

  const openURL = useCallback(async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', `Cannot open URL: ${url}`);
      }
    } catch {
      Alert.alert('Error', 'Could not open the link. Please try again.');
    }
  }, []);

  const platformVersion = `${Platform.OS.charAt(0).toUpperCase()}${Platform.OS.slice(1)} ${String(Platform.Version)}`;

  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      {/* Header */}
      <View className="flex-row items-center px-3 h-12">
        <Pressable
          onPress={handleBack}
          className="p-2 rounded-lg active:bg-white/5"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={20} color={c.textSecondary} />
        </Pressable>
        <Text variant="subheading" className="ml-2">
          About
        </Text>
      </View>

      <ScrollView className="flex-1 px-4" contentContainerClassName="pb-10 gap-5">
        {/* Logo + identity */}
        <View className="items-center pt-4 pb-2 gap-3">
          <View
            className="w-20 h-20 rounded-full items-center justify-center"
            style={{ backgroundColor: `${c.teal}22` }}
          >
            <Sparkles size={36} color={c.teal} />
          </View>
          <View className="items-center gap-1">
            <Text className="text-2xl font-bold text-white">AGI Workforce</Text>
            <Text className="text-base text-white/50">v{APP_VERSION}</Text>
          </View>
          <Text className="text-sm text-white/40 text-center px-8">
            Your AI desktop agent, in your pocket.
          </Text>
        </View>

        {/* Build info */}
        <Card>
          <View className="flex-row items-center gap-2 mb-3">
            <Info size={14} color={c.textMuted} />
            <Text variant="caption" className="uppercase tracking-wider">
              Build Info
            </Text>
          </View>
          <InfoRow label="Build" value={APP_BUILD} />
          <Separator />
          <InfoRow label="Platform" value={platformVersion} />
          <Separator />
          <InfoRow label="Runtime" value={RUNTIME} />
        </Card>

        {/* Links */}
        <Card>
          <Text variant="caption" className="mb-3 uppercase tracking-wider">
            Resources
          </Text>
          <LinkRow
            icon={ExternalLink}
            label="Website"
            onPress={() => openURL('https://agiworkforce.com')}
          />
          <Separator />
          <LinkRow
            icon={ExternalLink}
            label="Privacy Policy"
            onPress={() => openURL('https://agiworkforce.com/privacy')}
          />
          <Separator />
          <LinkRow
            icon={ExternalLink}
            label="Terms of Service"
            onPress={() => openURL('https://agiworkforce.com/terms')}
          />
          <Separator />
          <LinkRow
            icon={ExternalLink}
            label="Open Source Licenses"
            onPress={() => openURL('https://agiworkforce.com/licenses')}
          />
        </Card>

        {/* Support */}
        <Card>
          <Text variant="caption" className="mb-3 uppercase tracking-wider">
            Support
          </Text>
          <Pressable
            className="flex-row items-center justify-between py-3 px-1 active:bg-white/5 rounded-lg"
            onPress={() => router.push('/(app)/feedback' as Parameters<typeof router.push>[0])}
            accessibilityLabel="Send Feedback"
            accessibilityRole="button"
          >
            <View className="flex-row items-center gap-3">
              <MessageCircle size={18} color={c.textSecondary} />
              <Text className="text-sm text-white">Send Feedback</Text>
            </View>
            <ExternalLink size={14} color={c.textMuted} />
          </Pressable>
          <Separator />
          <LinkRow
            icon={Mail}
            label="Contact Support"
            onPress={() => openURL('mailto:support@agiworkforce.com')}
          />
        </Card>

        {/* Footer */}
        <View className="items-center pt-2">
          <Text className="text-[11px] text-white/20">Built in San Francisco</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
