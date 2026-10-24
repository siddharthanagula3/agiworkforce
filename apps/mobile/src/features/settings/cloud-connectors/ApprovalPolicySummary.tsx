import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { ShieldCheck } from 'lucide-react-native';
import { toolApprovalPolicyOption } from '@agiworkforce/types';
import { Text } from '@/components/ui/Text';
import { SettingsGroup, SettingsRow } from '@/src/features/settings/Common';
import { useSettingsStore } from '@/stores/settingsStore';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

export const ACTION_APPROVALS_ROUTE = '/(app)/settings/auto-approve';

export function ApprovalPolicySummary({ label, helper }: { label: string; helper: string }) {
  const colors = useThemeColors();
  const router = useRouter();
  const toolApprovalPolicy = useSettingsStore((s) => s.toolApprovalPolicy);
  return (
    <SettingsGroup>
      <SettingsRow
        label={label}
        value={toolApprovalPolicyOption(toolApprovalPolicy).shortLabel}
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
