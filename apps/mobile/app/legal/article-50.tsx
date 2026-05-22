/**
 * Mobile legal reference screen for EU AI Act Article 50.
 *
 * The same verbatim citations that ship in
 * `@agiworkforce/compliance/article50-text.ts` are surfaced here so the
 * user can see the exact regulatory text we are complying with. Reviewers
 * (Apple App Review, EU legal) can also reach this screen from the privacy
 * policy footer.
 *
 * This file deliberately ships NO chat or routing logic. It only renders
 * the strings exported from the compliance package and links out to the
 * canonical EU source.
 *
 * Title: "EU AI Act — Article 50"
 * Linked from: /legal route in the drawer + privacy policy footer.
 */
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
import { Text } from '@/components/ui/text';

export default function Article50Screen() {
  const openSource = () => {
    void Linking.openURL(ARTICLE_50_SOURCE_URL);
  };

  return (
    <SafeAreaView className="flex-1 bg-[#0f1012]">
      <ScrollView
        className="flex-1 px-6"
        contentContainerStyle={{ paddingBottom: 48, paddingTop: 16 }}
      >
        <Text className="text-white text-3xl font-bold mb-2">EU AI Act — Article 50</Text>
        <Text className="text-white/60 text-sm mb-6">
          Transparency obligations for AI systems. Enters full application on 2 August 2026 across
          the European Union under Regulation (EU) 2024/1689.
        </Text>

        <Section title="Article 50(1) — verbatim">
          <Text className="text-white/85 text-base leading-6">{ARTICLE_50_1_VERBATIM}</Text>
          <Text className="text-white/55 text-xs mt-3">
            How AGI complies: a first-run disclosure tells you "you are interacting with an AI
            system" before any prompt is sent. The same screen records your Apple 5.1.2(i)
            named-provider consent so we do not double-prompt.
          </Text>
        </Section>

        <Section title="Article 50(2) — verbatim">
          <Text className="text-white/85 text-base leading-6">{ARTICLE_50_2_VERBATIM}</Text>
          <Text className="text-white/55 text-xs mt-3">
            How AGI complies: every AI-generated text, audio, image or video you export is marked
            with a C2PA-style provenance claim and an HTML{' '}
            <Text variant="mono">{'<meta name="agi:ai-generated">'}</Text>
            tag so downstream tools can detect it as machine-generated.
          </Text>
        </Section>

        <Section title="Article 50(4) — verbatim (deep fakes)">
          <Text className="text-white/85 text-base leading-6">{ARTICLE_50_4_VERBATIM}</Text>
        </Section>

        <Section title="Penalty exposure">
          <Text className="text-white/85 text-base leading-6">{ARTICLE_50_PENALTY_TEXT}</Text>
        </Section>

        <Section title="Providers OFF by default">
          <Text className="text-white/85 text-base leading-6 mb-3">
            The following providers are headquartered in China. Routing your conversations through
            them is OFF by default. You can enable each one individually from the consent screen at
            first run or later in Settings.
          </Text>
          <View className="gap-2">
            {CHINESE_HQ_PROVIDER_IDS.map((id) => (
              <View
                key={id}
                className="rounded-xl px-4 py-3"
                style={{ backgroundColor: 'rgba(33, 128, 141, 0.10)' }}
              >
                <Text className="text-white text-base">{chineseHqProviderDisplayName(id)}</Text>
              </View>
            ))}
          </View>
        </Section>

        <Pressable
          onPress={openSource}
          accessibilityRole="link"
          accessibilityLabel="Open the canonical EU AI Act Article 50 page in your browser"
          className="rounded-2xl mt-6 py-4 items-center bg-teal-500/20 active:opacity-80"
        >
          <Text className="text-teal-200 text-sm font-medium">
            Read the full Article 50 on artificialintelligenceact.eu
          </Text>
        </Pressable>

        <Text className="text-white/40 text-xs mt-6 leading-5">
          Citations on this screen are reproduced verbatim from Regulation (EU) 2024/1689, Chapter
          IV, Article 50. Spelling and punctuation follow the Official Journal (OJ L, 12.7.2024).
          This screen is for your reference — it is not legal advice.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mb-6">
      <Text className="text-white text-lg font-semibold mb-2">{title}</Text>
      {children}
    </View>
  );
}
