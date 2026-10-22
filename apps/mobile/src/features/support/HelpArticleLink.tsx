import { CircleHelp } from 'lucide-react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { API_URL } from '@/lib/constants';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

export const MOBILE_HELP_ARTICLE_IDS = [
  'account-security',
  'artifacts',
  'billing-and-plans',
  'connectors-and-mcp',
  'crisis-resources',
  'local-mode',
  'memory',
  'privacy-controls',
  'projects',
  'schedules-and-triggers',
  'sharing-conversations',
  'temporary-chats',
  'tool-approvals',
  'usage-and-credits',
  'voice',
] as const;

export type MobileHelpArticleId = (typeof MOBILE_HELP_ARTICLE_IDS)[number];

export function helpArticleUrl(docId: MobileHelpArticleId): string {
  const origin = API_URL.replace(/\/+$/, '');
  return `${origin}/help/${encodeURIComponent(docId)}?from=mobile`;
}

export function HelpArticleLink({ docId, label }: { docId: MobileHelpArticleId; label: string }) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={() => void openUntrustedUrlInAppBrowser(helpArticleUrl(docId))}
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint="Opens the help article"
      style={{
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        alignSelf: 'flex-start',
      }}
    >
      <CircleHelp size={15} color={colors.textSecondary} />
      <Text
        style={{
          color: colors.textSecondary,
          fontSize: typeScale.footnote,
          fontWeight: '500',
          textDecorationLine: 'underline',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
