import { View } from 'react-native';
import type {
  CloudCodeAgentApproval,
  CloudCodeApprovalDecision,
} from '@agiworkforce/cloud-contracts';
import { CLOUD_CODE_SESSION_COPY } from '@agiworkforce/types';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

export function CloudCodeApprovalCard({
  approval,
  disabled,
  onDecide,
}: {
  approval: CloudCodeAgentApproval;
  disabled: boolean;
  onDecide: (decision: CloudCodeApprovalDecision) => void;
}) {
  const colors = useThemeColors();

  return (
    <View
      style={{
        borderRadius: 16,
        borderCurve: 'continuous',
        padding: 15,
        gap: 10,
        backgroundColor: colors.warningSurface,
        borderWidth: 1,
        borderColor: colors.warningBorder,
      }}
    >
      <Text style={{ color: colors.textPrimary, fontSize: typeScale.subhead, fontWeight: '700' }}>
        {CLOUD_CODE_SESSION_COPY.approvalHeading}
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: typeScale.footnote, lineHeight: 19 }}>
        {approval.reason}
      </Text>
      <Text
        variant="mono"
        selectable
        style={{ color: colors.textPrimary, fontSize: typeScale.caption, lineHeight: 18 }}
      >
        {approval.command}
      </Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button
          title={CLOUD_CODE_SESSION_COPY.reject}
          variant="outline"
          disabled={disabled}
          accessibilityLabel={`${CLOUD_CODE_SESSION_COPY.reject}: ${approval.command}`}
          onPress={() => onDecide('reject')}
          style={{ flex: 1 }}
        />
        <Button
          title={CLOUD_CODE_SESSION_COPY.approve}
          disabled={disabled}
          accessibilityLabel={`${CLOUD_CODE_SESSION_COPY.approve}: ${approval.command}`}
          onPress={() => onDecide('approve')}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}
