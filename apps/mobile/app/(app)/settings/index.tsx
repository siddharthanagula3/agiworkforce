import { View, ScrollView, Pressable, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  LogOut,
  Bell,
  Vibrate,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Separator } from '@/components/ui/separator';
import { Card } from '@/components/ui/card';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { api } from '@/services/api';
import { colors } from '@/lib/theme';

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
    >
      <View className="flex-row items-center gap-3">
        <Icon size={18} color={colors.textSecondary} />
        <Text className="text-sm text-white">{label}</Text>
      </View>
      {value && <Text className="text-sm text-white/50">{value}</Text>}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut } = useAuthStore();
  const { hapticsEnabled, notificationsEnabled, setHapticsEnabled, setNotificationsEnabled } =
    useSettingsStore();

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  const handleManageSubscription = async () => {
    try {
      // Try to get a dynamic billing portal URL from the API first
      const data = await api.post<{ url: string }>('/api/billing/portal');
      if (data.url) {
        await Linking.openURL(data.url);
        return;
      }
    } catch {
      // Fall back to the static billing page if API is unavailable
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
    <SafeAreaView className="flex-1 bg-surface-base">
      <View className="flex-row items-center px-3 h-12">
        <Pressable
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/(app)' as Parameters<typeof router.replace>[0]);
          }}
          className="p-2 rounded-lg active:bg-white/5"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={20} color={colors.textSecondary} />
        </Pressable>
        <Text variant="subheading" className="ml-2">
          Settings
        </Text>
      </View>

      <ScrollView className="flex-1 px-4" contentContainerClassName="pb-8 gap-6">
        {/* Account */}
        <Card>
          <Text variant="caption" className="mb-3 uppercase tracking-wider">
            Account
          </Text>
          <Text className="text-white">{user?.email ?? 'Not signed in'}</Text>
        </Card>

        {/* Preferences */}
        <Card>
          <Text variant="caption" className="mb-3 uppercase tracking-wider">
            Preferences
          </Text>
          <SettingRow
            icon={Vibrate}
            label="Haptic Feedback"
            value={hapticsEnabled ? 'On' : 'Off'}
            onPress={() => setHapticsEnabled(!hapticsEnabled)}
          />
          <Separator />
          <SettingRow
            icon={Bell}
            label="Push Notifications"
            value={notificationsEnabled ? 'On' : 'Off'}
            onPress={() => setNotificationsEnabled(!notificationsEnabled)}
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
      </ScrollView>
    </SafeAreaView>
  );
}
