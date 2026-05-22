import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Cloud, Monitor, X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { CloudWaitlistSheet, joinWaitlist, useWaitlistStore } from '@/src/features/waitlist';
import { useThemeColors } from '@/src/ui/theme';

interface EnvironmentOptionsSheetProps {
  visible: boolean;
  onClose: () => void;
  onOpenDesktop: () => void;
}

export function EnvironmentOptionsSheet({
  visible,
  onClose,
  onOpenDesktop,
}: EnvironmentOptionsSheetProps) {
  const c = useThemeColors();
  const [waitlistVisible, setWaitlistVisible] = useState(false);
  const markWaitlistJoined = useWaitlistStore((s) => s.markJoined);

  const openDesktop = useCallback(() => {
    onClose();
    onOpenDesktop();
  }, [onClose, onOpenDesktop]);

  const openWaitlist = useCallback(() => {
    onClose();
    setWaitlistVisible(true);
  }, [onClose]);

  const handleWaitlistSubmit = useCallback(
    async (submission: { email: string; country: string | null }) => {
      const result = await joinWaitlist({
        email: submission.email,
        country: submission.country ?? undefined,
      });
      markWaitlistJoined(
        { email: submission.email, country: submission.country ?? undefined },
        result,
      );
      return result;
    },
    [markWaitlistJoined],
  );

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
        accessibilityViewIsModal
      >
        <Pressable
          className="flex-1 justify-end"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.58)' }}
          onPress={onClose}
          accessibilityLabel="Close environment options"
        >
          <Pressable
            testID="code-environment-sheet"
            onPress={() => {
              /* keep taps inside the sheet */
            }}
            className="rounded-t-[28px] px-5 pt-5 pb-8"
            style={{ backgroundColor: c.surfaceBase }}
          >
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-[20px] font-semibold" style={{ color: c.textPrimary }}>
                Start code session
              </Text>
              <Pressable
                onPress={onClose}
                className="w-10 h-10 rounded-full items-center justify-center border active:opacity-80"
                style={{ borderColor: c.border, backgroundColor: c.surfaceElevated }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X size={20} color={c.textSecondary} />
              </Pressable>
            </View>

            <Text className="text-[13px] leading-[19px] mb-5" style={{ color: c.textMuted }}>
              Mobile can view, approve, and add feedback. Code execution needs AGI Desktop or a
              Cloud Managed environment.
            </Text>

            <EnvironmentOption
              icon={<Monitor size={22} color={c.teal} />}
              title="Use AGI Desktop"
              body="Pair this phone with your local desktop host."
              onPress={openDesktop}
            />
            <EnvironmentOption
              icon={<Cloud size={22} color={c.agentActive} />}
              title="Cloud Managed waitlist"
              body="Join the waitlist for hosted code environments."
              onPress={openWaitlist}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <CloudWaitlistSheet
        visible={waitlistVisible}
        onClose={() => setWaitlistVisible(false)}
        onSubmit={handleWaitlistSubmit}
      />
    </>
  );
}

function EnvironmentOption({
  icon,
  title,
  body,
  onPress,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  onPress: () => void;
}) {
  const c = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-4 rounded-2xl border p-4 mb-3 active:opacity-80"
      style={{ borderColor: c.border, backgroundColor: c.surfaceElevated }}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View
        className="w-11 h-11 rounded-2xl items-center justify-center"
        style={{ backgroundColor: c.surfaceHover }}
      >
        {icon}
      </View>
      <View className="flex-1">
        <Text className="text-[16px] font-semibold" style={{ color: c.textPrimary }}>
          {title}
        </Text>
        <Text className="text-[13px] leading-[18px] mt-1" style={{ color: c.textMuted }}>
          {body}
        </Text>
      </View>
    </Pressable>
  );
}
