import { View, ScrollView, Pressable, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  LogOut,
  Bell,
  Vibrate,
  ExternalLink,
  Key,
  Brain,
  User,
  Shield,
  Smartphone,
  Calendar,
  HardDrive,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Separator } from '@/components/ui/separator';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useConnectionStore } from '@/stores/connectionStore';
import { useModelStore } from '@/stores/modelStore';
import { api } from '@/services/api';
import { colors } from '@/lib/theme';
import type { AutoApproveMode } from '@/types/chat';

// ---------------------------------------------------------------------------
// Reusable row components
// ---------------------------------------------------------------------------

function SettingRow({
  icon: Icon,
  label,
  value,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      className="flex-row items-center justify-between py-3 px-1 active:bg-white/5 rounded-lg"
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
    >
      <View className="flex-row items-center gap-3">
        <Icon size={18} color={colors.textSecondary} />
        <Text className="text-sm text-white">{label}</Text>
      </View>
      {value ? (
        <View className="flex-row items-center gap-1">
          <Text className="text-sm text-white/50">{value}</Text>
          <ChevronRight size={14} color={colors.textMuted} />
        </View>
      ) : (
        <ChevronRight size={14} color={colors.textMuted} />
      )}
    </Pressable>
  );
}

function SettingToggle({
  icon: Icon,
  label,
  value,
  onValueChange,
}: {
  icon: LucideIcon;
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View className="flex-row items-center justify-between py-3 px-1">
      <View className="flex-row items-center gap-3">
        <Icon size={18} color={colors.textSecondary} />
        <Text className="text-sm text-white">{label}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Auto-approve mode selector
// ---------------------------------------------------------------------------

const AUTO_APPROVE_OPTIONS: { mode: AutoApproveMode; label: string; description: string }[] = [
  { mode: 'ask', label: 'Always Ask', description: 'Manually approve every action' },
  { mode: 'smart', label: 'Smart', description: 'Auto-approve low-risk, ask for high-risk' },
  { mode: 'full', label: 'Full Auto', description: 'Auto-approve all actions' },
];

function AutoApproveSelector() {
  const autoApproveMode = useSettingsStore((s) => s.autoApproveMode);
  const setAutoApproveMode = useSettingsStore((s) => s.setAutoApproveMode);

  return (
    <View>
      <View className="flex-row items-center gap-2 mb-3">
        <Shield size={18} color={colors.textSecondary} />
        <Text className="text-sm text-white">Auto-Approve Mode</Text>
      </View>
      <View className="gap-2">
        {AUTO_APPROVE_OPTIONS.map((opt) => (
          <Pressable
            key={opt.mode}
            onPress={() => setAutoApproveMode(opt.mode)}
            className="flex-row items-center gap-3 py-2.5 px-3 rounded-lg"
            style={{
              backgroundColor:
                autoApproveMode === opt.mode ? 'rgba(33,128,141,0.15)' : 'transparent',
              borderWidth: autoApproveMode === opt.mode ? 1 : 0,
              borderColor: autoApproveMode === opt.mode ? 'rgba(33,128,141,0.3)' : 'transparent',
            }}
            accessibilityLabel={opt.label}
            accessibilityRole="radio"
            accessibilityState={{ selected: autoApproveMode === opt.mode }}
          >
            <View
              className="w-5 h-5 rounded-full border-2 items-center justify-center"
              style={{
                borderColor: autoApproveMode === opt.mode ? colors.teal : colors.textMuted,
              }}
            >
              {autoApproveMode === opt.mode && (
                <View className="w-2.5 h-2.5 rounded-full bg-teal-500" />
              )}
            </View>
            <View className="flex-1">
              <Text className="text-[13px] text-white font-medium">{opt.label}</Text>
              <Text className="text-[11px] text-white/40">{opt.description}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Settings Screen
// ---------------------------------------------------------------------------

export default function SettingsTabScreen() {
  const router = useRouter();
  const { user, signOut } = useAuthStore();
  const connectionStatus = useConnectionStore((s) => s.status);
  const selectedModel = useModelStore((s) => s.selectedModel);
  const {
    hapticsEnabled,
    notificationsEnabled,
    voiceEnabled,
    backgroundFetchEnabled,
    setHapticsEnabled,
    setNotificationsEnabled,
    setVoiceEnabled,
    setBackgroundFetchEnabled,
  } = useSettingsStore();

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  const handleManageSubscription = async () => {
    try {
      const data = await api.post<{ url: string }>('/api/billing/portal');
      if (data.url) {
        await Linking.openURL(data.url);
        return;
      }
    } catch {
      // Fall back to static URL
    }
    try {
      await Linking.openURL('https://agiworkforce.com/billing');
    } catch {
      Alert.alert(
        'Error',
        'Could not open subscription management. Please visit agiworkforce.com/billing in your browser.',
      );
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-base" edges={['top']}>
      <View className="flex-row items-center px-4 h-12">
        <Text variant="subheading" className="text-white">
          Settings
        </Text>
      </View>

      <ScrollView className="flex-1 px-4" contentContainerClassName="pb-8 gap-5">
        {/* Account */}
        <Card>
          <Text variant="caption" className="mb-3 uppercase tracking-wider">
            Account
          </Text>
          <Text className="text-white">{user?.email ?? 'Not signed in'}</Text>
          <Separator className="my-3" />
          <SettingRow
            icon={User}
            label="Profile"
            onPress={() => router.push('/(app)/profile' as Parameters<typeof router.push>[0])}
          />
        </Card>

        {/* Model Selection */}
        <Card>
          <Text variant="caption" className="mb-3 uppercase tracking-wider">
            AI Model
          </Text>
          <SettingRow
            icon={Brain}
            label="Selected Model"
            value={selectedModel}
            onPress={() => {
              // Model picker is accessible from the chat input
              Alert.alert(
                'Model Selection',
                'Use the model selector in the chat input to change models.',
              );
            }}
          />
        </Card>

        {/* Desktop Connection */}
        <Card>
          <Text variant="caption" className="mb-3 uppercase tracking-wider">
            Desktop Connection
          </Text>
          <SettingRow
            icon={Smartphone}
            label="Desktop Companion"
            value={connectionStatus === 'connected' ? 'Connected' : 'Not connected'}
            onPress={() => router.push('/(app)/companion' as Parameters<typeof router.push>[0])}
          />
        </Card>

        {/* Security */}
        <Card>
          <Text variant="caption" className="mb-3 uppercase tracking-wider">
            Security
          </Text>
          <AutoApproveSelector />
        </Card>

        {/* Preferences */}
        <Card>
          <Text variant="caption" className="mb-3 uppercase tracking-wider">
            Preferences
          </Text>
          <SettingToggle
            icon={Vibrate}
            label="Haptic Feedback"
            value={hapticsEnabled}
            onValueChange={setHapticsEnabled}
          />
          <Separator />
          <SettingToggle
            icon={Bell}
            label="Push Notifications"
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
          />
          <Separator />
          <SettingToggle
            icon={Brain}
            label="Voice Features"
            value={voiceEnabled}
            onValueChange={setVoiceEnabled}
          />
          <Separator />
          <SettingToggle
            icon={HardDrive}
            label="Background Agent Sync"
            value={backgroundFetchEnabled}
            onValueChange={setBackgroundFetchEnabled}
          />
        </Card>

        {/* Data */}
        <Card>
          <Text variant="caption" className="mb-3 uppercase tracking-wider">
            Data
          </Text>
          <SettingRow
            icon={Key}
            label="Memory"
            onPress={() =>
              router.push('/(app)/settings/memory' as Parameters<typeof router.push>[0])
            }
          />
          <Separator />
          <SettingRow
            icon={Calendar}
            label="Schedules"
            onPress={() => router.push('/(app)/schedules' as Parameters<typeof router.push>[0])}
          />
        </Card>

        {/* Billing */}
        <Card>
          <Text variant="caption" className="mb-3 uppercase tracking-wider">
            Billing
          </Text>
          <SettingRow
            icon={ExternalLink}
            label="Manage Subscription"
            onPress={handleManageSubscription}
          />
        </Card>

        {/* Sign Out */}
        <Card>
          <SettingRow icon={LogOut} label="Sign Out" onPress={handleSignOut} />
        </Card>

        {/* App version */}
        <View className="items-center pt-2">
          <Text className="text-[11px] text-white/20">AGI Workforce Mobile v0.1.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
