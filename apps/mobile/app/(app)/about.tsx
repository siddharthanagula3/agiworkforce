import { useCallback } from 'react';
import { View, ScrollView, Alert, Linking, Platform } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import {
  ArrowLeft,
  Sparkles,
  ExternalLink,
  FileText,
  MessageCircle,
  Mail,
  Info,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useThemeColors } from '@/src/ui/theme';
import { openExternalUrl } from '@/lib/safeOpenURL';
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
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
      style={({ pressed }) => ({
        width: '100%',
        minHeight: 40,
        borderRadius: 10,
        paddingHorizontal: 4,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: pressed ? c.surfaceHover : c.transparent,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Icon size={18} color={c.textSecondary} />
        <Text style={{ color: c.textPrimary, fontSize: 14 }}>{label}</Text>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Info row (no press action)
// ---------------------------------------------------------------------------

function InfoRow({ label, value }: { label: string; value: string }) {
  const c = useThemeColors();
  return (
    <View
      style={{
        minHeight: 36,
        paddingHorizontal: 4,
        paddingVertical: 7,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
      }}
    >
      <Text style={{ color: c.textSecondary, fontSize: 14 }}>{label}</Text>
      <Text numberOfLines={1} style={{ color: c.textMuted, fontSize: 14, flexShrink: 1 }}>
        {value}
      </Text>
    </View>
  );
}

function platformDisplayName(os: string): string {
  if (os === 'ios') return 'iOS';
  if (os === 'android') return 'Android';
  return os.charAt(0).toUpperCase() + os.slice(1);
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

  // Web pages go through the allowlist helper; only the support address stays
  // on raw Linking, since a mailto: is not an https: URL it can accept.
  const openWebPage = useCallback(async (url: string) => {
    const opened = await openExternalUrl(url);
    if (!opened) Alert.alert('Error', 'Could not open the link. Please try again.');
  }, []);

  const openMail = useCallback(async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'No mail app is set up on this device.');
      }
    } catch {
      Alert.alert('Error', 'Could not open the link. Please try again.');
    }
  }, []);

  const platformVersion = `${platformDisplayName(Platform.OS)} ${String(Platform.Version)}`;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header */}
      <View
        style={{
          height: 48,
          paddingHorizontal: 12,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <Pressable
          onPress={handleBack}
          accessibilityLabel="Go back"
          accessibilityRole="button"
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? c.surfaceHover : c.transparent,
          })}
        >
          <ArrowLeft size={20} color={c.textSecondary} />
        </Pressable>
        <Text
          variant="subheading"
          style={{ marginLeft: 8, color: c.textPrimary, fontWeight: '700' }}
        >
          About
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 14 }}
      >
        {/* Logo + identity */}
        <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 2, gap: 8 }}>
          <View
            style={{
              width: 68,
              height: 68,
              borderRadius: 34,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: c.accentSurface,
            }}
          >
            <Sparkles size={30} color={c.teal} />
          </View>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Text style={{ color: c.textPrimary, fontSize: 22, fontWeight: '700' }}>
              AGI Workforce
            </Text>
            <Text style={{ color: c.textMuted, fontSize: 16 }}>v{APP_VERSION}</Text>
          </View>
          <Text
            style={{
              color: c.textMuted,
              fontSize: 14,
              textAlign: 'center',
              paddingHorizontal: 32,
              lineHeight: 19,
            }}
          >
            Private Local Mode and AGI Cloud, on your phone.
          </Text>
        </View>

        {/* Build info */}
        <Card style={{ padding: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Info size={14} color={c.textMuted} />
            <Text variant="caption" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
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
        <Card style={{ padding: 14 }}>
          <Text
            variant="caption"
            style={{ marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}
          >
            Resources
          </Text>
          <LinkRow
            icon={ExternalLink}
            label="Website"
            onPress={() => void openWebPage('https://agiworkforce.com')}
          />
          <Separator />
          <LinkRow
            icon={ExternalLink}
            label="Privacy Policy"
            onPress={() => void openWebPage('https://agiworkforce.com/privacy')}
          />
          <Separator />
          <LinkRow
            icon={ExternalLink}
            label="Terms of Service"
            onPress={() => void openWebPage('https://agiworkforce.com/terms')}
          />
          <Separator />
          {/* In-app, not a web page: there is no /licenses route on the site,
              and store review expects the attribution inside the app. */}
          <LinkRow
            icon={FileText}
            label="Open Source Licenses"
            onPress={() =>
              router.push('/(app)/legal/licenses' as Parameters<typeof router.push>[0])
            }
          />
        </Card>

        {/* Support */}
        <Card style={{ padding: 14 }}>
          <Text
            variant="caption"
            style={{ marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}
          >
            Support
          </Text>
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/(app)/feedback',
                params: { returnTo: '/(app)/about' },
              } as Parameters<typeof router.push>[0])
            }
            accessibilityLabel="Send Feedback"
            accessibilityRole="button"
            style={({ pressed }) => ({
              width: '100%',
              minHeight: 40,
              borderRadius: 10,
              paddingHorizontal: 4,
              paddingVertical: 8,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: pressed ? c.surfaceHover : c.transparent,
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <MessageCircle size={18} color={c.textSecondary} />
              <Text style={{ color: c.textPrimary, fontSize: 14 }}>Send Feedback</Text>
            </View>
          </Pressable>
          <Separator />
          <LinkRow
            icon={Mail}
            label="Contact Support"
            onPress={() => void openMail('mailto:support@agiworkforce.com')}
          />
        </Card>

        {/* Footer */}
        <View style={{ alignItems: 'center', paddingTop: 8 }}>
          <Text style={{ color: c.textMuted, fontSize: 11 }}>AGI Automation LLC · USA</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
