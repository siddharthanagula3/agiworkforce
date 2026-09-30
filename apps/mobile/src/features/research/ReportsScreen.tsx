import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, View } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
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
import { typeScale } from '@/src/ui/theme/tokens';
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
      <PressableBox
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={8}
        style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
      >
        <ArrowLeft size={21} color={colors.textSecondary} />
      </PressableBox>
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          color: colors.textPrimary,
          fontSize: typeScale.headline,
          fontWeight: '700',
        }}
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
    <PressableBox
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
          style={{ fontSize: typeScale.subhead, fontWeight: '600', color: colors.textPrimary }}
        >
          {researchReportLabel(report)}
        </Text>
        <Text
          numberOfLines={1}
          style={{ fontSize: typeScale.caption, color: colors.textMuted, marginTop: 2 }}
        >
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
          <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
            {report.status}
          </Text>
        </View>
      ) : null}
    </PressableBox>
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
        ...(citation.publishedDate ? { publishedDate: citation.publishedDate } : {}),
      })),
    [report.citations],
  );
  const retrievedOn = useMemo(() => {
    const times = report.citations
      .map((citation) => Date.parse(citation.accessedAt))
      .filter((time) => Number.isFinite(time));
    return times.length > 0
      ? new Date(Math.max(...times)).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      : null;
  }, [report.citations]);
  const scrollRef = useRef<ScrollView>(null);
  const contentTop = useRef(0);
  const headingTops = useRef(new Map<string, number>());
  const handleHeadingLayout = useCallback((sectionId: string, y: number) => {
    headingTops.current.set(sectionId, y);
  }, []);
  const jumpToSection = useCallback((sectionId: string) => {
    const top = headingTops.current.get(sectionId);
    if (top === undefined) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, contentTop.current + top - 8), animated: true });
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScreenHeader title={researchReportLabel(report)} onBack={onBack} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 12 }}
        testID="research-report-detail"
      >
        {report.summary ? (
          <Text
            style={{ fontSize: typeScale.subhead, lineHeight: 21, color: colors.textSecondary }}
          >
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
            <Text style={{ flex: 1, fontSize: typeScale.caption, color: colors.textSecondary }}>
              {report.error}
            </Text>
          </View>
        ) : null}

        {report.keyFindings.length > 0 ? (
          <View style={{ gap: 4 }}>
            <Text
              style={{ fontSize: typeScale.caption, fontWeight: '600', color: colors.textMuted }}
            >
              Key findings
            </Text>
            {report.keyFindings.map((finding, index) => (
              <Text
                key={`${index}-${finding.slice(0, 16)}`}
                style={{ fontSize: typeScale.footnote, lineHeight: 20, color: colors.textPrimary }}
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
            <Text
              style={{ fontSize: typeScale.caption, fontWeight: '600', color: colors.textMuted }}
            >
              {`Sections · ${sections.length}`}
            </Text>
            {sections.map((section) => (
              <PressableBox
                key={section.id}
                onPress={() => jumpToSection(section.id)}
                accessibilityRole="button"
                accessibilityLabel={`Go to ${section.text}`}
                hitSlop={4}
                style={{
                  minHeight: 32,
                  justifyContent: 'center',
                  paddingLeft: Math.max(0, section.level - (sections[0]?.level ?? 1)) * 12,
                }}
              >
                <Text
                  style={{
                    fontSize: typeScale.caption,
                    lineHeight: 19,
                    color: colors.textSecondary,
                  }}
                >
                  {section.text}
                </Text>
              </PressableBox>
            ))}
          </View>
        ) : null}

        <View
          onLayout={(event) => {
            contentTop.current = event.nativeEvent.layout.y;
          }}
        >
          {renderMarkdownContent(report.content, colors, {
            citations: sources,
            onHeadingLayout: handleHeadingLayout,
          })}
        </View>

        <ResearchSourcesAppendix sources={sources} />
        {retrievedOn ? (
          <Text
            style={{ fontSize: typeScale.caption, color: colors.textMuted }}
            testID="research-report-sources-retrieved"
          >
            {`Sources retrieved ${retrievedOn}`}
          </Text>
        ) : null}
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
        setError('Could not load reports. Check your connection and try again.');
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
          <Text
            style={{ fontSize: typeScale.subhead, fontWeight: '600', color: colors.textPrimary }}
          >
            Sign in to read your reports
          </Text>
          <Text style={{ fontSize: typeScale.footnote, color: colors.textSecondary }}>
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
          <Text style={{ fontSize: typeScale.footnote, color: colors.textSecondary }}>
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
          <Text
            style={{ fontSize: typeScale.subhead, fontWeight: '600', color: colors.textPrimary }}
          >
            No reports yet
          </Text>
          <Text style={{ fontSize: typeScale.footnote, color: colors.textSecondary }}>
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
