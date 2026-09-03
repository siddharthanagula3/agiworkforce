import { ScrollView, View, Pressable, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ARTICLE_50_1_VERBATIM,
  ARTICLE_50_2_VERBATIM,
  ARTICLE_50_4_VERBATIM,
  ARTICLE_50_PENALTY_TEXT,
  ARTICLE_50_SOURCE_URL,
  CHINESE_HQ_PROVIDER_IDS,
  chineseHqProviderDisplayName,
} from '@agiworkforce/compliance';
import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { readChineseHqConsent } from '@/services/providerConsent';

export const PROVIDER_STATE_TEST_ID_PREFIX = 'article-50-provider-state-';

const PROVIDER_SETTINGS_ROUTE = '/(app)/settings/cloud-privacy' as const;
const PROVIDER_STATE_ON = 'On';
const PROVIDER_STATE_OFF = 'Off';

export default function Article50Screen() {
  const colors = useThemeColors();
  const router = useRouter();
  const [consent, setConsent] = useState(readChineseHqConsent);
  useFocusEffect(
    useCallback(() => {
      setConsent(readChineseHqConsent());
    }, []),
  );
  const openSource = () => {
    void Linking.openURL(ARTICLE_50_SOURCE_URL);
  };
  const openProviderSettings = () => {
    router.push(PROVIDER_SETTINGS_ROUTE);
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.surfaceBase }}>
      <ScrollView
        className="flex-1 px-6"
        contentContainerStyle={{ paddingBottom: 48, paddingTop: 16 }}
      >
        <Text style={{ color: colors.textPrimary, fontSize: 30, fontWeight: '700' }}>
          EU AI Act Article 50
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 24, marginTop: 8 }}>
          Transparency obligations for AI systems. Enters full application on 2 August 2026 across
          the European Union under Regulation (EU) 2024/1689.
        </Text>

        <Section title="Article 50(1) verbatim">
          <Text style={{ color: colors.textPrimary, fontSize: 16, lineHeight: 24 }}>
            {ARTICLE_50_1_VERBATIM}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 12 }}>
            How AGI complies: a first-run disclosure tells you "you are interacting with an AI
            system" before any prompt is sent. The same screen records your Apple 5.1.2(i)
            named-provider consent so we do not double-prompt.
          </Text>
        </Section>

        <Section title="Article 50(2) verbatim">
          <Text style={{ color: colors.textPrimary, fontSize: 16, lineHeight: 24 }}>
            {ARTICLE_50_2_VERBATIM}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 12 }}>
            How AGI complies: generated images and video carry a C2PA-style provenance claim naming
            the provider, the model and the time of generation.
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 12 }}>
            Your on-device data export marks each chat transcript with that same claim and an HTML{' '}
            <Text variant="mono" style={{ color: colors.textPrimary }}>
              {'<meta name="agi:ai-generated">'}
            </Text>
            tag.
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 12 }}>
            Chat text you copy or share by any other route is not marked, and AGI does not generate
            audio.
          </Text>
        </Section>

        <Section title="Article 50(4) verbatim (deep fakes)">
          <Text style={{ color: colors.textPrimary, fontSize: 16, lineHeight: 24 }}>
            {ARTICLE_50_4_VERBATIM}
          </Text>
        </Section>

        <Section title="Penalty exposure">
          <Text style={{ color: colors.textPrimary, fontSize: 16, lineHeight: 24 }}>
            {ARTICLE_50_PENALTY_TEXT}
          </Text>
        </Section>

        <Section title="Providers OFF by default">
          <Text
            style={{
              color: colors.textPrimary,
              fontSize: 16,
              lineHeight: 24,
              marginBottom: 12,
            }}
          >
            The following providers are headquartered in China. Routing your conversations through
            them is OFF by default. You can enable each one individually from the consent screen at
            first run or later in Settings, Privacy. Their current state on this device is shown
            below.
          </Text>
          <View className="gap-2">
            {CHINESE_HQ_PROVIDER_IDS.map((id) => (
              <View
                key={id}
                testID={`${PROVIDER_STATE_TEST_ID_PREFIX}${id}`}
                className="rounded-xl px-4 py-3 flex-row items-center justify-between"
                style={{ backgroundColor: colors.accentSurface }}
              >
                <Text style={{ color: colors.textPrimary, fontSize: 16, flex: 1 }}>
                  {chineseHqProviderDisplayName(id)}
                </Text>
                <Text
                  style={{
                    color: consent[id] ? colors.teal : colors.textMuted,
                    fontSize: 14,
                    fontWeight: '600',
                  }}
                >
                  {consent[id] ? PROVIDER_STATE_ON : PROVIDER_STATE_OFF}
                </Text>
              </View>
            ))}
          </View>
          <Pressable
            testID="article-50-manage-providers"
            onPress={openProviderSettings}
            accessibilityRole="button"
            accessibilityLabel="Open Settings, Privacy to change these providers"
            className="rounded-2xl mt-3 py-4 items-center active:opacity-80"
            style={{ backgroundColor: colors.accentSurface }}
          >
            <Text style={{ color: colors.teal, fontSize: 14, fontWeight: '600' }}>
              Change these in Settings, Privacy
            </Text>
          </Pressable>
        </Section>

        <Pressable
          onPress={openSource}
          accessibilityRole="link"
          accessibilityLabel="Open the canonical EU AI Act Article 50 page in your browser"
          className="rounded-2xl mt-6 py-4 items-center active:opacity-80"
          style={{ backgroundColor: colors.accentSurface }}
        >
          <Text style={{ color: colors.teal, fontSize: 14, fontWeight: '600' }}>
            Read the full Article 50 on artificialintelligenceact.eu
          </Text>
        </Pressable>

        <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 20, marginTop: 24 }}>
          Citations on this screen are reproduced verbatim from Regulation (EU) 2024/1689, Chapter
          IV, Article 50. Spelling and punctuation follow the Official Journal (OJ L, 12.7.2024).
          This screen is for your reference. It is not legal advice.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useThemeColors();

  return (
    <View style={{ marginBottom: 24 }}>
      <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '600', marginBottom: 8 }}>
        {title}
      </Text>
      {children}
    </View>
  );
}
