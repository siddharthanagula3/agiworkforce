/**
 * Shared Links screen — v1 placeholder.
 * Cloud feature gated via CloudWaitlistSheet per v1-cloud-bridge lock.
 * TODO: swap CloudWaitlistSheet to InviteCodeModal when Stage 0 lands.
 */
import { useCallback, useState } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Link2, Lock } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { useThemeColors } from '@/src/ui/theme';
import {
  CloudWaitlistSheet,
  type WaitlistSubmission,
  type WaitlistResult,
} from '@/src/features/waitlist/CloudWaitlistSheet';
import { submitWaitlistForSource } from '@/src/features/waitlist/service';

export default function SharedLinksScreen() {
  const router = useRouter();
  const c = useThemeColors();
  const [showWaitlist, setShowWaitlist] = useState(false);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)' as Parameters<typeof router.replace>[0]);
  }, [router]);

  const handleWaitlistSubmit = useCallback(
    (submission: WaitlistSubmission): Promise<WaitlistResult> =>
      submitWaitlistForSource(submission, 'shared-links'),
    [],
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.surfaceBase }}>
      <View className="flex-row items-center px-3 h-12">
        <Pressable
          onPress={handleBack}
          className="p-2 rounded-lg active:bg-white/5"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={20} color={c.textSecondary} />
        </Pressable>
        <Text variant="subheading" className="ml-2" style={{ color: c.textPrimary }}>
          Shared Links
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Cloud gate banner */}
        <View
          style={{
            marginBottom: 20,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: `${c.agentWarning}2E`,
            backgroundColor: `${c.agentWarning}10`,
            padding: 14,
          }}
          accessible
          accessibilityLabel="Shared Links is a Cloud feature, waitlisted for v1."
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Lock size={14} color={c.agentWarning} />
            <Text style={{ color: c.agentWarning, fontSize: 13, fontWeight: '600' }}>
              Cloud feature
            </Text>
          </View>
          <Text style={{ color: c.textSecondary, fontSize: 12, lineHeight: 17 }}>
            Shared Links lets you publish conversations and invite collaborators. This feature opens
            with Cloud Managed — join the waitlist to be notified.
          </Text>
        </View>

        {/* Placeholder card */}
        <Card>
          <View className="items-center py-8 gap-3">
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                backgroundColor: `${c.teal}14`,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Link2 size={26} color={c.teal} strokeWidth={1.5} />
            </View>
            <Text
              style={{
                fontSize: 17,
                fontWeight: '600',
                color: c.textPrimary,
                textAlign: 'center',
              }}
            >
              No shared links yet
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: c.textSecondary,
                textAlign: 'center',
                lineHeight: 18,
                maxWidth: 260,
              }}
            >
              When Cloud opens, shared conversations will appear here.
            </Text>
          </View>
        </Card>

        <Pressable
          onPress={() => setShowWaitlist(true)}
          style={{
            marginTop: 16,
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: 'center',
            backgroundColor: c.teal,
          }}
          accessibilityLabel="Join the Cloud waitlist"
          accessibilityRole="button"
        >
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Join the waitlist</Text>
        </Pressable>
      </ScrollView>

      <CloudWaitlistSheet
        visible={showWaitlist}
        onClose={() => setShowWaitlist(false)}
        onSubmit={handleWaitlistSubmit}
      />
    </SafeAreaView>
  );
}
