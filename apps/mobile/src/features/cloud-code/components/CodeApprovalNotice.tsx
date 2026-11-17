import { useCallback } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { toolApprovalPolicyOption } from '@agiworkforce/types';
import { Button } from '@/components/ui/Button';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { useToolApprovalPolicySync } from '@/src/features/settings/tool-approvals/useToolApprovalPolicySync';
import { useCodePreferences, useCodePreferencesHydrated } from '@/src/features/settings/code/store';
import { useThemeColors } from '@/src/ui/theme';
import { dialogPadding, typeScale } from '@/src/ui/theme/tokens';
import { contentColumn } from '@/src/shared/layout/contentColumn';

export const CODE_APPROVAL_NOTICE_TITLE = 'Code sessions use your approval setting';
export const CODE_APPROVAL_NOTICE_GOT_IT = 'Got it';
export const CODE_APPROVAL_NOTICE_LEARN_MORE = 'Learn more';
const APPROVAL_SETTINGS_ROUTE = '/(app)/settings/auto-approve';

function ApprovalNoticeCard({ accountKey }: { accountKey: string }) {
  const colors = useThemeColors();
  const router = useRouter();
  const approval = useToolApprovalPolicySync();
  const markSeen = useCodePreferences((state) => state.markApprovalNoticeSeen);

  const dismiss = useCallback(() => markSeen(accountKey), [accountKey, markSeen]);
  const learnMore = useCallback(() => {
    markSeen(accountKey);
    router.push(APPROVAL_SETTINGS_ROUTE as Parameters<typeof router.push>[0]);
  }, [accountKey, markSeen, router]);

  if (!approval.ready || approval.status !== 'synced') return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={dismiss}
      accessibilityViewIsModal
      statusBarTranslucent
    >
      <View
        style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.scrim }}
      >
        <PressableBox
          testID="code-approval-notice-backdrop"
          onPress={dismiss}
          accessible={false}
          importantForAccessibility="no"
          style={StyleSheet.absoluteFill}
        />
        <View
          testID="code-approval-notice"
          onAccessibilityEscape={dismiss}
          style={{
            ...contentColumn('form'),
            maxHeight: '80%',
            backgroundColor: colors.surfaceBase,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: colors.border,
            padding: dialogPadding,
          }}
        >
          <ScrollView bounces={false} contentContainerStyle={{ gap: 12 }}>
            <Text
              accessibilityRole="header"
              style={{ color: colors.textPrimary, fontSize: typeScale.title3, fontWeight: '700' }}
            >
              {CODE_APPROVAL_NOTICE_TITLE}
            </Text>
            <Text
              style={{ color: colors.textSecondary, fontSize: typeScale.subhead, lineHeight: 21 }}
            >
              {toolApprovalPolicyOption(approval.policy).hint}
            </Text>
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
            <Button
              testID="code-approval-notice-got-it"
              title={CODE_APPROVAL_NOTICE_GOT_IT}
              variant="outline"
              onPress={dismiss}
              style={{ flex: 1 }}
            />
            <Button
              testID="code-approval-notice-learn-more"
              title={CODE_APPROVAL_NOTICE_LEARN_MORE}
              variant="outline"
              onPress={learnMore}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function CodeApprovalNotice({ accountKey }: { accountKey: string }) {
  const hydrated = useCodePreferencesHydrated();
  const seen = useCodePreferences((state) => state.approvalNoticeSeenAccounts.includes(accountKey));

  if (!hydrated || seen) return null;
  return <ApprovalNoticeCard accountKey={accountKey} />;
}
