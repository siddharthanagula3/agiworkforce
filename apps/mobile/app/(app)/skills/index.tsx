import { useCallback, useState } from 'react';
import { View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Cloud, Sparkles } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { InviteCodeModal } from '@/src/features/cloud-bridge';
import { useWaitlistStore } from '@/src/features/waitlist';
import type { InviteCodeTab } from '@/src/features/cloud-bridge/types';

export default function SkillsScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const waitlistJoined = useWaitlistStore((s) => s.joined);
  const waitlistRank = useWaitlistStore((s) => s.rank);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [defaultTab, setDefaultTab] = useState<InviteCodeTab>('waitlist');

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)' as Parameters<typeof router.replace>[0]);
  }, [router]);

  const openCloudAccess = useCallback((tab: InviteCodeTab) => {
    setDefaultTab(tab);
    setInviteOpen(true);
  }, []);

  const waitlistLabel =
    waitlistJoined && typeof waitlistRank === 'number'
      ? `Waitlist #${(waitlistRank + 1).toLocaleString()}`
      : waitlistJoined
        ? 'Waitlist joined'
        : 'Join waitlist';

  return (
    <SafeAreaView className="flex-1 bg-surface-base" edges={['top']}>
      <View className="flex-row items-center px-4 h-12">
        <Pressable
          onPress={handleBack}
          className="p-2 -ml-2 rounded-lg active:bg-white/5"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={20} color={colors.textSecondary} />
        </Pressable>
        <View className="flex-row items-center gap-2 ml-2">
          <Sparkles size={18} color={colors.textSecondary} />
          <Text variant="subheading" style={{ color: colors.textPrimary }}>
            Skills
          </Text>
        </View>
      </View>

      <View className="flex-1 px-5 justify-center pb-24">
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 16,
            backgroundColor: colors.surfaceElevated,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 18,
          }}
        >
          <Cloud size={24} color={colors.textSecondary} />
        </View>
        <Text style={{ fontSize: 26, fontWeight: '700', color: colors.textPrimary }}>
          AGI Cloud skills
        </Text>
        <Text style={{ fontSize: 15, lineHeight: 22, color: colors.textSecondary, marginTop: 10 }}>
          Skills will connect AGI to repeatable cloud workflows across chat, projects, files, and
          artifacts. This feature isn’t available on mobile yet — Local and Cloud chat stay
          available in the meantime.
        </Text>

        <View style={{ gap: 10, marginTop: 28 }}>
          <Pressable
            onPress={() => openCloudAccess('waitlist')}
            accessibilityRole="button"
            accessibilityLabel={waitlistLabel}
            style={{
              minHeight: 52,
              borderRadius: 16,
              backgroundColor: colors.teal,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 18,
            }}
          >
            <Text style={{ color: colors.white, fontSize: 16, fontWeight: '600' }}>
              {waitlistLabel}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => openCloudAccess('invite')}
            accessibilityRole="button"
            accessibilityLabel="Enter invite code"
            style={{
              minHeight: 52,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surfaceElevated,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 18,
            }}
          >
            <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: '600' }}>
              Enter invite code
            </Text>
          </Pressable>
        </View>
      </View>

      <InviteCodeModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        source="other"
        defaultTab={defaultTab}
        title="AGI Cloud skills"
        body="Skills aren’t available on mobile yet. Join the waitlist to get notified, or enter your invitation code if you have early access."
      />
    </SafeAreaView>
  );
}
