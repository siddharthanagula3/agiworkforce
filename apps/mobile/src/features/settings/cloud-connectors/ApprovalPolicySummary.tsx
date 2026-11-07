import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { ShieldCheck } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { SettingsGroup, SettingsRow } from '@/src/features/settings/Common';
import { useToolApprovalPolicySync } from '../tool-approvals/useToolApprovalPolicySync';
import { toolApprovalPolicySummary } from '../tool-approvals/toolApprovalPolicyOwner';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

export const ACTION_APPROVALS_ROUTE = '/(app)/settings/auto-approve';

export function ApprovalPolicySummary({ label, helper }: { label: string; helper: string }) {
  const colors = useThemeColors();
  const router = useRouter();
  const approval = useToolApprovalPolicySync();
  return (
    <SettingsGroup>
      <SettingsRow
        label={label}
        value={toolApprovalPolicySummary(approval)}
        icon={ShieldCheck}
        onPress={() => router.push(ACTION_APPROVALS_ROUTE)}
        isLast
      />
      <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
        <Text style={{ color: colors.textSecondary, fontSize: typeScale.subhead }}>{helper}</Text>
      </View>
    </SettingsGroup>
  );
}
