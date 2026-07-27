import { useCallback } from 'react';
import type { ReactNode } from 'react';
import { Alert, Modal, Pressable, Text as NativeText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Cloud, Monitor, X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
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
  const insets = useSafeAreaInsets();

  const openDesktop = useCallback(() => {
    onClose();
    onOpenDesktop();
  }, [onClose, onOpenDesktop]);

  // Was a waitlist + invitation-code modal. Managed cloud went to public alpha
  // on 2026-06-27 and the invite gate was removed, so asking for an invitation
  // code offered access that no longer needs granting. Hosted code environments
  // genuinely are not on mobile — say that, and point at where they do run.
  const showHostedInfo = useCallback(() => {
    onClose();
    Alert.alert(
      'Hosted code environments',
      'Code sessions do not run on mobile yet. Start one from AGI Desktop or the web app and it will appear here.',
      [{ text: 'OK' }],
    );
  }, [onClose]);

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
          accessible={false}
          style={{
            flex: 1,
            justifyContent: 'flex-end',
            backgroundColor: c.scrim,
          }}
          onPress={onClose}
        >
          <Pressable
            testID="code-environment-sheet"
            accessible={false}
            onPress={() => {
              /* keep taps inside the sheet */
            }}
            style={{
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              paddingHorizontal: 20,
              paddingTop: 20,
              paddingBottom: Math.max(insets.bottom + 16, 32),
              backgroundColor: c.surfaceBase,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                marginBottom: 12,
              }}
            >
              <Text
                numberOfLines={1}
                style={{ flex: 1, color: c.textPrimary, fontSize: 20, fontWeight: '700' }}
              >
                Start code session
              </Text>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => ({
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: c.border,
                  backgroundColor: pressed ? c.surfaceHover : c.surfaceElevated,
                })}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={8}
              >
                <X size={20} color={c.textSecondary} />
              </Pressable>
            </View>

            <Text style={{ color: c.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 18 }}>
              Mobile can view, approve, and add feedback. Code execution needs AGI Desktop or a
              Cloud environment.
            </Text>

            <EnvironmentOption
              icon={<Monitor size={22} color={c.teal} />}
              title="Use AGI Desktop"
              body="Pair this phone with your local desktop host."
              onPress={openDesktop}
            />
            <EnvironmentOption
              icon={<Cloud size={22} color={c.agentActive} />}
              title="Hosted code environments"
              body="Not available on mobile. Run code sessions from Desktop or the web app."
              onPress={showHostedInfo}
            />
          </Pressable>
        </Pressable>
      </Modal>
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
      style={({ pressed }) => ({
        width: '100%',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: pressed ? c.surfaceHover : c.surfaceElevated,
        padding: 14,
        marginBottom: 12,
      })}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: c.surfaceHover,
            marginRight: 12,
          }}
        >
          {icon}
        </View>
        <NativeText
          numberOfLines={1}
          style={{ color: c.textPrimary, fontSize: 15, fontWeight: '700', flex: 1 }}
        >
          {title}
        </NativeText>
      </View>
      <NativeText
        numberOfLines={2}
        style={{ color: c.textMuted, fontSize: 13, lineHeight: 18, paddingLeft: 44 }}
      >
        {body}
      </NativeText>
    </Pressable>
  );
}
