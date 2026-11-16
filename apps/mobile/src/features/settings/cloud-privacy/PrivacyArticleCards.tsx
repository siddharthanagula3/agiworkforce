import { CircleUserRound, Download, EyeOff, ShieldCheck, Trash2 } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { openHelpArticle, type MobileHelpArticleId } from '@/src/features/support/HelpArticleLink';
import { useThemeColors } from '@/src/ui/theme';
import { radii, typeScale } from '@/src/ui/theme/tokens';
import { CAROUSEL_GAP, CAROUSEL_GUTTER, PrivacyCenterSection } from './PrivacyCenterSection';
import { openOrAlert } from './privacyCenterLinks';

interface PrivacyArticle {
  docId: MobileHelpArticleId;
  title: string;
  category: 'Privacy' | 'Security' | 'Data';
  icon: LucideIcon;
}

export const PRIVACY_ARTICLES: readonly PrivacyArticle[] = [
  {
    docId: 'privacy-controls',
    title: 'How privacy controls work',
    category: 'Privacy',
    icon: ShieldCheck,
  },
  { docId: 'temporary-chats', title: 'Temporary chats', category: 'Privacy', icon: EyeOff },
  {
    docId: 'export-your-data',
    title: 'Export a copy of your data',
    category: 'Data',
    icon: Download,
  },
  { docId: 'delete-your-account', title: 'Delete your account', category: 'Data', icon: Trash2 },
  {
    docId: 'account-security',
    title: 'Passkeys, two-factor and active sessions',
    category: 'Security',
    icon: CircleUserRound,
  },
];

const CARD_WIDTH_SHARE = 0.56;

export function PrivacyArticleCards() {
  const colors = useThemeColors();
  const { width } = useWindowDimensions();
  const cardWidth = Math.round(width * CARD_WIDTH_SHARE);

  return (
    <PrivacyCenterSection title="Learn and act">
      <ScrollView
        testID="privacy-article-cards"
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + CAROUSEL_GAP}
        snapToAlignment="start"
        decelerationRate="fast"
        style={{ marginHorizontal: -CAROUSEL_GUTTER }}
        contentContainerStyle={{ paddingHorizontal: CAROUSEL_GUTTER, gap: CAROUSEL_GAP }}
      >
        {PRIVACY_ARTICLES.map((article) => {
          const Icon = article.icon;
          return (
            <Pressable
              key={article.docId}
              onPress={() => void openOrAlert(() => openHelpArticle(article.docId))}
              accessibilityRole="button"
              accessibilityLabel={`${article.title}. ${article.category}`}
              accessibilityHint="Opens the help article"
              style={{
                width: cardWidth,
                minHeight: 44,
                borderRadius: radii.md,
                backgroundColor: colors.surfaceElevated,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 14,
                gap: 10,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: radii.sm,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.surfaceHover,
                }}
              >
                <Icon size={20} color={colors.textSecondary} />
              </View>
              <Text
                numberOfLines={2}
                style={{
                  color: colors.textPrimary,
                  fontSize: typeScale.subhead,
                  fontWeight: '600',
                }}
              >
                {article.title}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
                {article.category}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </PrivacyCenterSection>
  );
}
