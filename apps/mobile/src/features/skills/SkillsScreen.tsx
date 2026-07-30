import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  TextInput,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, BookOpen, Cloud, RefreshCw, Search, Sparkles, X } from 'lucide-react-native';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { FEATURES } from '@/lib/v1FeatureFlags';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { FeatureUnavailable } from '@/src/shared/components/FeatureUnavailable';
import { useThemeColors } from '@/src/ui/theme';
import { fetchManagedSkills, type ManagedSkillSource, type ManagedSkillSummary } from './service';

const SOURCE_LABELS: Record<ManagedSkillSource, string> = {
  bundled: 'Built in',
  'managed-local': 'Managed',
  personal: 'Personal',
  project: 'Project',
  workspace: 'Workspace',
  extra: 'Added',
};

function SkillsHeader({ onBack }: { onBack: () => void }) {
  const colors = useThemeColors();

  return (
    <View
      style={{
        minHeight: 52,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={8}
        style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
      >
        <ArrowLeft size={21} color={colors.textSecondary} />
      </Pressable>
      <Text style={{ flex: 1, color: colors.textPrimary, fontSize: 18, fontWeight: '700' }}>
        Skills
      </Text>
      <View
        accessibilityLabel="Managed Cloud catalog"
        style={{
          borderRadius: 999,
          paddingHorizontal: 10,
          paddingVertical: 5,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          backgroundColor: colors.accentSurface,
          borderWidth: 1,
          borderColor: colors.accentBorder,
        }}
      >
        <Cloud size={13} color={colors.textSecondary} />
        <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600' }}>Cloud</Text>
      </View>
    </View>
  );
}

function SkillsGate({
  signedIn,
  onBack,
  onContinue,
}: {
  signedIn: boolean;
  onBack: () => void;
  onContinue: () => void;
}) {
  const colors = useThemeColors();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
      <SkillsHeader onBack={onBack} />
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 32,
        }}
      >
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 24,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.accentSurface,
          }}
        >
          <BookOpen size={32} color={colors.textPrimary} />
        </View>
        <Text
          style={{
            marginTop: 20,
            color: colors.textPrimary,
            fontSize: 21,
            fontWeight: '700',
            textAlign: 'center',
          }}
        >
          Skills are available in AGI Cloud
        </Text>
        <Text
          style={{
            marginTop: 9,
            color: colors.textSecondary,
            fontSize: 14,
            lineHeight: 21,
            textAlign: 'center',
          }}
        >
          Browse the Skills installed on your Managed Cloud deployment. Switching here does not send
          Local chats or files to the cloud.
        </Text>
        <Button
          title={signedIn ? 'Switch to AGI Cloud' : 'Sign in to AGI Cloud'}
          onPress={onContinue}
          size="lg"
          accessibilityHint="Opens the Cloud Skills catalog without sending Local Mode data"
          style={{ marginTop: 24, minWidth: 210 }}
        />
      </View>
    </SafeAreaView>
  );
}

function SearchField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const colors = useThemeColors();

  return (
    <View
      style={{
        height: 44,
        borderRadius: 14,
        paddingHorizontal: 13,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
        backgroundColor: colors.inputSurface,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Search size={17} color={colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Search skills"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Search skills"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        style={{ flex: 1, color: colors.textPrimary, fontSize: 15, paddingVertical: 0 }}
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => onChange('')}
          accessibilityRole="button"
          accessibilityLabel="Clear skill search"
          hitSlop={8}
          style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}
        >
          <X size={16} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

function SkillRow({ skill }: { skill: ManagedSkillSummary }) {
  const colors = useThemeColors();

  return (
    <View
      accessibilityLabel={`${skill.name}. ${SOURCE_LABELS[skill.source]}`}
      style={{
        borderRadius: 16,
        borderCurve: 'continuous',
        padding: 15,
        gap: 9,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.accentSurface,
          }}
        >
          <Sparkles size={18} color={colors.textPrimary} />
        </View>
        <View style={{ flex: 1, gap: 5 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text
              selectable
              numberOfLines={1}
              style={{ flex: 1, color: colors.textPrimary, fontSize: 15, fontWeight: '600' }}
            >
              {skill.name}
            </Text>
            <View
              style={{
                borderRadius: 999,
                paddingHorizontal: 8,
                paddingVertical: 3,
                backgroundColor: colors.neutralSurface,
                borderWidth: 1,
                borderColor: colors.neutralBorder,
              }}
            >
              <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '600' }}>
                {SOURCE_LABELS[skill.source]}
              </Text>
            </View>
          </View>
          <Text selectable style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
            {skill.description || 'No description provided.'}
          </Text>
        </View>
      </View>
    </View>
  );
}

function CatalogIntro({ count }: { count: number }) {
  const colors = useThemeColors();

  return (
    <View style={{ gap: 14 }}>
      <View
        style={{
          borderRadius: 16,
          borderCurve: 'continuous',
          padding: 15,
          gap: 6,
          backgroundColor: colors.accentSurface,
          borderWidth: 1,
          borderColor: colors.accentBorder,
        }}
      >
        <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '600' }}>
          Managed Cloud catalog
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
          These Skills are installed on the deployment and can be selected automatically when a
          Cloud task needs them. Mobile browsing is read-only.
        </Text>
      </View>
      <Text
        accessibilityLabel={`${count} skills available`}
        style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}
      >
        {count === 1 ? '1 SKILL AVAILABLE' : `${count} SKILLS AVAILABLE`}
      </Text>
    </View>
  );
}

function CatalogRefreshError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();

  return (
    <View
      accessibilityRole="alert"
      style={{
        borderRadius: 14,
        borderCurve: 'continuous',
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: colors.dangerSurface,
        borderWidth: 1,
        borderColor: colors.dangerBorder,
      }}
    >
      <Text selectable style={{ flex: 1, color: colors.agentError, fontSize: 12, lineHeight: 18 }}>
        Refresh failed: {message}
      </Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Retry refreshing Skills"
        hitSlop={8}
        style={{ minHeight: 32, justifyContent: 'center', paddingHorizontal: 6 }}
      >
        <Text style={{ color: colors.agentError, fontSize: 12, fontWeight: '700' }}>Retry</Text>
      </Pressable>
    </View>
  );
}

function CatalogEmptyState({ query, onClear }: { query: string; onClear: () => void }) {
  const colors = useThemeColors();
  const isSearching = query.trim().length > 0;

  return (
    <View
      style={{
        flex: 1,
        minHeight: 330,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 28,
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.neutralSurface,
        }}
      >
        {isSearching ? (
          <Search size={27} color={colors.textMuted} />
        ) : (
          <BookOpen size={27} color={colors.textMuted} />
        )}
      </View>
      <Text
        style={{
          marginTop: 18,
          color: colors.textPrimary,
          fontSize: 18,
          fontWeight: '700',
          textAlign: 'center',
        }}
      >
        {isSearching ? 'No matching Skills' : 'No managed Skills yet'}
      </Text>
      <Text
        style={{
          marginTop: 8,
          color: colors.textSecondary,
          fontSize: 14,
          lineHeight: 21,
          textAlign: 'center',
        }}
      >
        {isSearching
          ? `No Skills match “${query.trim()}”. Try a different name, description, or source.`
          : 'When Skills are added to this AGI Cloud deployment, they will appear here and become available to Cloud tasks.'}
      </Text>
      {isSearching ? (
        <Button
          title="Clear search"
          variant="outline"
          onPress={onClear}
          style={{ marginTop: 20, minWidth: 150 }}
        />
      ) : null}
    </View>
  );
}

function LoadingCatalog() {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 12 }}>
      <Skeleton width="100%" height={86} borderRadius={16} />
      <Skeleton width={130} height={14} />
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} width="100%" height={100} borderRadius={16} />
      ))}
    </View>
  );
}

function CatalogError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const colors = useThemeColors();

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.dangerSurface,
        }}
      >
        <RefreshCw size={26} color={colors.agentError} />
      </View>
      <Text
        style={{
          marginTop: 18,
          color: colors.textPrimary,
          fontSize: 18,
          fontWeight: '700',
          textAlign: 'center',
        }}
      >
        Could not load Skills
      </Text>
      <Text
        selectable
        style={{
          marginTop: 8,
          color: colors.textSecondary,
          fontSize: 14,
          lineHeight: 21,
          textAlign: 'center',
        }}
      >
        {message}
      </Text>
      <Button title="Try again" variant="outline" onPress={onRetry} style={{ marginTop: 20 }} />
    </View>
  );
}

export function SkillsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const appMode = useChatAppModeStore((state) => state.appMode);
  const setAppMode = useChatAppModeStore((state) => state.setAppMode);
  const isClerkLoaded = useAuthStore((state) => state.isClerkLoaded);
  const isClerkSignedIn = useAuthStore((state) => state.isClerkSignedIn);
  const clerkUserId = useAuthStore((state) => state.clerkUserId);

  const [skills, setSkills] = useState<ManagedSkillSummary[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const cloudActive = appMode === 'cloud';
  const canLoad = FEATURES.skills && isClerkLoaded && isClerkSignedIn && cloudActive;

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)/chat' as Parameters<typeof router.replace>[0]);
  }, [router]);

  const handleContinue = useCallback(() => {
    if (!isClerkSignedIn) {
      router.push('/(auth)/login' as Parameters<typeof router.push>[0]);
      return;
    }
    setAppMode('cloud');
  }, [isClerkSignedIn, router, setAppMode]);

  const load = useCallback(
    async (reason: 'initial' | 'refresh', signal?: AbortSignal) => {
      const account = captureCloudAccountEpoch();
      if (!account || account.ownerId !== clerkUserId) {
        setSkills([]);
        setError(null);
        return;
      }

      if (reason === 'initial') setLoading(true);
      else setRefreshing(true);
      setError(null);

      try {
        const nextSkills = await fetchManagedSkills(signal);
        if (!isCloudAccountEpochCurrent(account)) return;
        setSkills(nextSkills);
      } catch (loadError) {
        if (signal?.aborted || !isCloudAccountEpochCurrent(account)) return;
        setError(loadError instanceof Error ? loadError.message : 'Failed to load Skills.');
      } finally {
        if (isCloudAccountEpochCurrent(account)) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [clerkUserId],
  );

  useEffect(() => {
    if (!canLoad) {
      setSkills([]);
      setError(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const controller = new AbortController();
    void load('initial', controller.signal);
    return () => controller.abort();
  }, [canLoad, clerkUserId, load, reloadKey]);

  const filteredSkills = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return skills;
    return skills.filter(
      (skill) =>
        skill.name.toLowerCase().includes(normalized) ||
        skill.description.toLowerCase().includes(normalized) ||
        SOURCE_LABELS[skill.source].toLowerCase().includes(normalized),
    );
  }, [query, skills]);

  const renderSkill = useCallback(
    ({ item }: ListRenderItemInfo<ManagedSkillSummary>) => <SkillRow skill={item} />,
    [],
  );

  if (!FEATURES.skills) return <FeatureUnavailable feature="Skills" />;
  if (!isClerkLoaded || !isClerkSignedIn || !cloudActive) {
    return (
      <SkillsGate signedIn={isClerkSignedIn} onBack={handleBack} onContinue={handleContinue} />
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
      <SkillsHeader onBack={handleBack} />
      <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
        <SearchField value={query} onChange={setQuery} />
      </View>

      {loading && skills.length === 0 ? (
        <LoadingCatalog />
      ) : error && skills.length === 0 ? (
        <CatalogError message={error} onRetry={() => setReloadKey((key) => key + 1)} />
      ) : (
        <FlatList
          data={filteredSkills}
          keyExtractor={(skill) => `${skill.source}:${skill.name}`}
          renderItem={renderSkill}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: 40,
            gap: 10,
            flexGrow: 1,
          }}
          ListHeaderComponent={
            <View style={{ gap: 10 }}>
              <CatalogIntro count={skills.length} />
              {error ? (
                <CatalogRefreshError message={error} onRetry={() => void load('refresh')} />
              ) : null}
            </View>
          }
          ListHeaderComponentStyle={{ paddingBottom: 12 }}
          ListEmptyComponent={<CatalogEmptyState query={query} onClear={() => setQuery('')} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load('refresh')}
              tintColor={colors.textPrimary}
              progressBackgroundColor={colors.surfaceElevated}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}
