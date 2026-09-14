import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertCircle, ArrowLeft, Telescope, TriangleAlert } from 'lucide-react-native';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { FeatureUnavailable } from '@/src/shared/components/FeatureUnavailable';
import { ResearchSourcesAppendix } from '@/src/features/chat/components/research/ResearchSourcesAppendix';
import { renderMarkdownContent } from '@/src/features/chat/components/MessageContentRenderer';
import { radii, useThemeColors } from '@/src/ui/theme';
import type { ToolSearchResult } from '@/types/chat';
import { extractReportSections } from './reportSections';
import { fetchResearchReports, researchReportLabel, type MobileResearchReport } from './service';

function formatCreatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

function ScreenHeader({ title, onBack }: { title: string; onBack: () => void }) {
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
      <Text
        numberOfLines={1}
        style={{ flex: 1, color: colors.textPrimary, fontSize: 18, fontWeight: '700' }}
      >
        {title}
      </Text>
    </View>
  );
}

function ReportRow({ report, onOpen }: { report: MobileResearchReport; onOpen: () => void }) {
  const colors = useThemeColors();
  const incomplete = report.status !== 'completed';
  const meta = [
    formatCreatedAt(report.createdAt),
    `${report.sourcesConsulted} ${report.sourcesConsulted === 1 ? 'source' : 'sources'}`,
    ...(report.model ? [report.model] : []),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${researchReportLabel(report)}. ${meta}`}
      testID="research-report-row"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        padding: 12,
        borderRadius: radii.lg,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: pressed ? colors.surfaceHover : colors.surfaceBase,
      })}
    >
      <Telescope size={16} color={colors.agentActive} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={2}
          style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}
        >
          {researchReportLabel(report)}
        </Text>
        <Text numberOfLines={1} style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
          {meta}
        </Text>
      </View>
      {incomplete ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 6,
            paddingVertical: 3,
            borderRadius: radii.sm,
            backgroundColor: colors.neutralSurface,
          }}
        >
          <TriangleAlert size={11} color={colors.textMuted} />
          <Text style={{ fontSize: 11, color: colors.textMuted }}>{report.status}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function ReportDetail({ report, onBack }: { report: MobileResearchReport; onBack: () => void }) {
  const colors = useThemeColors();
  const sections = useMemo(() => extractReportSections(report.content), [report.content]);
  const sources = useMemo<ToolSearchResult[]>(
    () =>
      report.citations.map((citation) => ({
        url: citation.url,
        title: citation.title || citation.url,
        ...(citation.snippet ? { snippet: citation.snippet } : {}),
      })),
    [report.citations],
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScreenHeader title={researchReportLabel(report)} onBack={onBack} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 12 }}
        testID="research-report-detail"
      >
        {report.summary ? (
          <Text style={{ fontSize: 14, lineHeight: 21, color: colors.textSecondary }}>
            {report.summary}
          </Text>
        ) : null}

        {report.error ? (
          <View
            style={{
              flexDirection: 'row',
              gap: 8,
              padding: 10,
              borderRadius: radii.md,
              borderWidth: 1,
              borderColor: colors.dangerBorder,
              backgroundColor: colors.dangerSurface,
            }}
          >
            <AlertCircle size={14} color={colors.agentError} />
            <Text style={{ flex: 1, fontSize: 12, color: colors.textSecondary }}>
              {report.error}
            </Text>
          </View>
        ) : null}

        {report.keyFindings.length > 0 ? (
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textMuted }}>
              Key findings
            </Text>
            {report.keyFindings.map((finding, index) => (
              <Text
                key={`${index}-${finding.slice(0, 16)}`}
                style={{ fontSize: 13, lineHeight: 20, color: colors.textPrimary }}
              >
                {`• ${finding}`}
              </Text>
            ))}
          </View>
        ) : null}

        {sections.length >= 3 ? (
          <View
            style={{
              gap: 2,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: radii.md,
              padding: 10,
            }}
            testID="research-report-detail-sections"
          >
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textMuted }}>
              {`Sections · ${sections.length}`}
            </Text>
            {sections.map((section) => (
              <Text
                key={section.id}
                style={{
                  fontSize: 12,
                  lineHeight: 19,
                  color: colors.textSecondary,
                  paddingLeft: Math.max(0, section.level - (sections[0]?.level ?? 1)) * 12,
                }}
              >
                {section.text}
              </Text>
            ))}
          </View>
        ) : null}

        <View>{renderMarkdownContent(report.content, colors)}</View>

        <ResearchSourcesAppendix sources={sources} />
      </ScrollView>
    </SafeAreaView>
  );
}

export function ReportsScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const appMode = useChatAppModeStore((s) => s.appMode);
  const isClerkSignedIn = useAuthStore((s) => s.isClerkSignedIn);
  const [reports, setReports] = useState<MobileResearchReport[]>([]);
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [openReport, setOpenReport] = useState<MobileResearchReport | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const signedInCloud = appMode === 'cloud' && isClerkSignedIn;

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!signedInCloud) return;
      setError(null);
      try {
        const loaded = await fetchResearchReports({ ...(signal ? { signal } : {}) });
        if (signal?.aborted) return;
        setReports(loaded);
        setState('loaded');
      } catch (loadError) {
        if (signal?.aborted) return;
        setError(loadError instanceof Error ? loadError.message : 'Could not load reports.');
        setState('error');
      }
    },
    [signedInCloud],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/chats');
  }, [router]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (!FEATURES.research) {
    return <FeatureUnavailable feature="Deep research" />;
  }

  if (!signedInCloud) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <ScreenHeader title="Reports" onBack={handleBack} />
        <View style={{ paddingHorizontal: 16, gap: 6 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>
            Sign in to read your reports
          </Text>
          <Text style={{ fontSize: 13, color: colors.textSecondary }}>
            Research reports are saved to your Managed Cloud account.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (openReport) {
    return <ReportDetail report={openReport} onBack={() => setOpenReport(null)} />;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScreenHeader title="Reports" onBack={handleBack} />
      {state === 'loading' ? (
        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          <Skeleton height={64} borderRadius={radii.lg} />
          <Skeleton height={64} borderRadius={radii.lg} />
          <Skeleton height={64} borderRadius={radii.lg} />
        </View>
      ) : state === 'error' ? (
        <View style={{ paddingHorizontal: 16, gap: 12, alignItems: 'flex-start' }}>
          <Text style={{ fontSize: 13, color: colors.textSecondary }}>
            {error ?? 'Could not load reports.'}
          </Text>
          <Button
            title="Try again"
            size="sm"
            onPress={() => void load()}
            accessibilityLabel="Try loading reports again"
          />
        </View>
      ) : reports.length === 0 ? (
        <View style={{ paddingHorizontal: 16, gap: 6 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textPrimary }}>
            No reports yet
          </Text>
          <Text style={{ fontSize: 13, color: colors.textSecondary }}>
            Turn on Research in the composer and ask a question. Finished runs are saved here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(report) => report.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 8 }}
          renderItem={({ item }) => <ReportRow report={item} onOpen={() => setOpenReport(item)} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void handleRefresh()}
              tintColor={colors.textMuted}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}
