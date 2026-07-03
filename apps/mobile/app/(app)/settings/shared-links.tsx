/**
 * Shared Links screen — v1 placeholder.
 * Cloud feature gated via InviteCodeModal (invite code + waitlist tabs).
 */
import { useCallback, useState } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, Link2, Lock } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { useTheme } from '@/src/ui/theme';
import { InviteCodeModal } from '@/src/features/cloud-bridge/InviteCodeModal';

export default function SharedLinksScreen() {
  const router = useRouter();
  const { colors: c, statusBarStyle } = useTheme();
  const [showModal, setShowModal] = useState(false);

  const handleBack = useCallback(() => {
    router.navigate('/(app)/settings/data-controls' as Parameters<typeof router.navigate>[0]);
  }, [router]);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.surfaceBase }}>
      <StatusBar style={statusBarStyle} />
      <View
        style={{ height: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}
      >
        <Pressable
          onPress={handleBack}
          hitSlop={8}
          style={({ pressed }) => ({
            width: 42,
            height: 42,
            borderRadius: 21,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? c.surfaceHover : c.transparent,
          })}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={22} color={c.textPrimary} />
        </Pressable>
        <Text
          style={{
            flex: 1,
            color: c.textPrimary,
            fontSize: 20,
            fontWeight: '700',
            marginLeft: 4,
          }}
        >
          Shared Links
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={{ paddingTop: 10, paddingBottom: 44 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Cloud gate banner */}
        <View
          style={{
            marginBottom: 20,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: c.warningBorder,
            backgroundColor: c.warningSurface,
            padding: 14,
          }}
          accessible
          accessibilityLabel="Shared Links isn't available on mobile yet."
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Lock size={14} color={c.agentWarning} />
            <Text style={{ color: c.agentWarning, fontSize: 13, fontWeight: '600' }}>
              Coming soon
            </Text>
          </View>
          <Text style={{ color: c.textSecondary, fontSize: 12, lineHeight: 17 }}>
            Shared Links lets you publish conversations and invite collaborators. This feature isn’t
            available on mobile yet — join the waitlist to get notified, or enter your invitation
            code if you have early access.
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
                backgroundColor: c.accentSurface,
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
              Shared conversations will appear here once this feature ships.
            </Text>
          </View>
        </Card>

        <Pressable
          onPress={() => setShowModal(true)}
          style={{
            marginTop: 16,
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: 'center',
            backgroundColor: c.teal,
          }}
          accessibilityLabel="Join the Shared Links waitlist or enter your invitation code"
          accessibilityRole="button"
        >
          <Text style={{ color: c.white, fontSize: 16, fontWeight: '600' }}>Join waitlist</Text>
        </Pressable>
      </ScrollView>

      <InviteCodeModal
        open={showModal}
        onClose={() => setShowModal(false)}
        source="shared-links"
        title="Shared Links"
        body="This feature isn’t available on mobile yet. Join the waitlist to get notified, or enter your invitation code if you have early access."
      />
    </SafeAreaView>
  );
}
