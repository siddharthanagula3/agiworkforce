import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Blocks, Bot, ChevronRight, Plug, Sparkles, type LucideIcon } from 'lucide-react-native';

import { PressableBox } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { MetaText, ScreenHeader } from '@/src/shared/components/cloud-screen';
import { useGoBack } from '@/src/shared/hooks/useGoBack';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

export interface CustomizeDestination {
  key: 'skills' | 'plugins' | 'connectors' | 'agents';
  title: string;
  body: string;
  route: string;
  Icon: LucideIcon;
}

export function customizeDestinations(features: { skills: boolean }): CustomizeDestination[] {
  const destinations: CustomizeDestination[] = [
    {
      key: 'plugins',
      title: 'Plugins',
      body: 'Bundles of skills, connectors and agents from AGI, partners and marketplaces.',
      route: '/(app)/plugins',
      Icon: Blocks,
    },
    {
      key: 'skills',
      title: 'Skills',
      body: 'Instructions and files the assistant loads when a task needs them.',
      route: '/(app)/skills',
      Icon: Sparkles,
    },
    {
      key: 'connectors',
      title: 'Connectors',
      body: 'Apps and data sources the assistant can read from and act in.',
      route: '/(app)/connectors',
      Icon: Plug,
    },
    {
      key: 'agents',
      title: 'Agents',
      body: 'Assistants with their own instructions, knowledge, tools and sharing.',
      route: '/(app)/agents',
      Icon: Bot,
    },
  ];
  return destinations.filter((destination) => destination.key !== 'skills' || features.skills);
}

export function CustomizeScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const goBack = useGoBack('/(app)/(tabs)/chat');
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
      <ScreenHeader title="Customize" onBack={goBack} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 10 }}>
        <MetaText>Everything that shapes what the assistant can do for you, in one place.</MetaText>
        {customizeDestinations(FEATURES).map(({ key, title, body, route, Icon }) => (
          <PressableBox
            key={key}
            onPress={() => router.push(route as Parameters<typeof router.push>[0])}
            accessibilityRole="link"
            accessibilityLabel={title}
            accessibilityHint={body}
            style={{
              minHeight: 64,
              borderRadius: 16,
              borderCurve: 'continuous',
              padding: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              backgroundColor: colors.surfaceElevated,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Icon size={20} color={colors.textPrimary} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text
                style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}
              >
                {title}
              </Text>
              <MetaText>{body}</MetaText>
            </View>
            <ChevronRight size={18} color={colors.textMuted} />
          </PressableBox>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
