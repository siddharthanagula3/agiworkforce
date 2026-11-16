import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Blocks, Bot, ChevronRight, Plug, Sparkles, type LucideIcon } from 'lucide-react-native';

import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { FEATURES } from '@/lib/v1FeatureFlags';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';
import { addedPluginsCountLabel } from '@/src/features/plugins/pluginsModel';
import { fetchPluginInstallations } from '@/src/features/plugins/service';
import { MetaText, ScreenHeader } from '@/src/shared/components/cloud-screen';
import { useCloudFeatureAccess } from '@/src/shared/hooks/useCloudFeatureAccess';
import { useGoBack } from '@/src/shared/hooks/useGoBack';
import { useHardwareBackDismiss } from '@/src/shared/hooks/useHardwareBackDismiss';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

import {
  CustomizeSearchBar,
  CustomizeSearchButton,
  CustomizeSearchResults,
} from './CustomizeSearch';
import { customizeSearchTerm } from './customizeSearchModel';
import { DiscoverSection } from './DiscoverSection';
import { PersonalSourceRows } from './PersonalSourceRows';

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
  const access = useCloudFeatureAccess();
  const [pluginsAdded, setPluginsAdded] = useState(0);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const destinations = customizeDestinations(FEATURES);
  const showResults = searching && customizeSearchTerm(query).length > 0;
  const cancelSearch = useCallback(() => {
    setSearching(false);
    setQuery('');
  }, []);
  const clearSearch = useCallback(() => setQuery(''), []);
  useHardwareBackDismiss(searching, cancelSearch);

  useFocusEffect(
    useCallback(() => {
      if (!access.ready) {
        setPluginsAdded(0);
        return;
      }
      const account = captureCloudAccountEpoch();
      if (!account) return;
      const controller = new AbortController();
      fetchPluginInstallations(controller.signal)
        .then((installations) => {
          if (controller.signal.aborted || !isCloudAccountEpochCurrent(account)) return;
          setPluginsAdded(installations.length);
        })
        .catch(() => {
          if (controller.signal.aborted || !isCloudAccountEpochCurrent(account)) return;
          setPluginsAdded(0);
        });
      return () => controller.abort();
    }, [access.ready]),
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
      {searching ? (
        <CustomizeSearchBar
          value={query}
          onChangeText={setQuery}
          onCancel={cancelSearch}
          localOnly={!access.ready}
        />
      ) : (
        <ScreenHeader
          title="Customize"
          onBack={goBack}
          trailing={<CustomizeSearchButton onPress={() => setSearching(true)} />}
        />
      )}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 10 }}
      >
        {searching ? (
          <CustomizeSearchResults query={query} destinations={destinations} onClear={clearSearch} />
        ) : null}
        <View style={{ gap: 10, display: showResults ? 'none' : 'flex' }}>
          <DiscoverSection />
          <MetaText>
            Everything that shapes what the assistant can do for you, in one place.
          </MetaText>
          {destinations.map(({ key, title, body, route, Icon }) => {
            const meta = key === 'plugins' ? addedPluginsCountLabel(pluginsAdded) : null;
            return (
              <PressableBox
                key={key}
                onPress={() => router.push(route as Parameters<typeof router.push>[0])}
                accessibilityRole="link"
                accessibilityLabel={meta ? `${title}, ${meta}` : title}
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
                    style={{
                      color: colors.textPrimary,
                      fontSize: typeScale.body,
                      fontWeight: '600',
                    }}
                  >
                    {title}
                  </Text>
                  <MetaText>{body}</MetaText>
                </View>
                {meta ? <MetaText>{meta}</MetaText> : null}
                <ChevronRight size={18} color={colors.textMuted} />
              </PressableBox>
            );
          })}
          <PersonalSourceRows />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
