import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Share, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  MANAGED_CLOUD_PUBLISHED_ARTIFACT_TITLE_MAX_CHARS,
  MANAGED_CLOUD_PUBLISHED_ARTIFACT_VISIBILITIES,
  type ManagedCloudPublishedArtifact,
  type ManagedCloudPublishedArtifactDataResponse,
  type ManagedCloudPublishedArtifactVersion,
} from '@agiworkforce/cloud-contracts';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { useCopyAction, copyControlLabel } from '@/src/shared/hooks/useCopyAction';
import {
  Chip,
  CloudFeatureGate,
  EmptyState,
  ErrorBanner,
  LoadingRows,
  MetaText,
  ScreenHeader,
  SectionCard,
  TextField,
  confirmIrreversible,
} from '@/src/shared/components/cloud-screen';
import { useCloudFeatureAccess } from '@/src/shared/hooks/useCloudFeatureAccess';
import { useGoBack } from '@/src/shared/hooks/useGoBack';
import { cloudActionError } from '@/src/shared/utils/cloudActionError';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { SITES_ROUTE } from './SitesScreen';
import { useSiteDetailLifetime, type SiteDetailLifetime } from './useSiteDetailLifetime';
import type { CloudFeatureAccess } from '@/src/shared/hooks/useCloudFeatureAccess';
import {
  SITE_VISIBILITY_LABELS,
  SiteMutationUncertainError,
  clearSiteSharedData,
  deleteSiteAndData,
  readPublishedSite,
  listSiteVersions,
  readSiteData,
  republishSiteVersion,
  siteName,
  siteSizeLabel,
  unpublishSite,
  updatePublishedSite,
} from './service';

interface SiteState {
  site: ManagedCloudPublishedArtifact;
  hasWorkspace: boolean;
  versions: ManagedCloudPublishedArtifactVersion[];
  versionsFailed: boolean;
  data: ManagedCloudPublishedArtifactDataResponse | null;
  dataFailed: boolean;
}

async function loadSite(view: SiteDetailLifetime): Promise<SiteState | null> {
  const { token, authority } = view;
  const { signal } = authority;
  authority.assertCurrent();
  const detail = await readPublishedSite(token, signal, authority);
  authority.assertCurrent();
  if (!detail) return null;
  const { site, workspace } = detail;
  const [versionsRead, dataRead] = await Promise.all([
    listSiteVersions(token, signal, authority).then(
      (versions) => ({ versions, failed: false }),
      () => {
        authority.assertCurrent();
        return { versions: [], failed: true };
      },
    ),
    readSiteData(token, signal, authority).then(
      (data) => ({ data, failed: false }),
      () => {
        authority.assertCurrent();
        return { data: null, failed: true };
      },
    ),
  ]);
  authority.assertCurrent();
  return {
    site,
    hasWorkspace: workspace !== null,
    versions: versionsRead.versions,
    versionsFailed: versionsRead.failed,
    data: dataRead.data,
    dataFailed: dataRead.failed,
  };
}

export function SiteDetailScreen() {
  const { token: param } = useLocalSearchParams<{ token?: string }>();
  const token = typeof param === 'string' ? param : '';
  const access = useCloudFeatureAccess();
  const view = useSiteDetailLifetime(token, access);
  return <SiteDetailBody key={view.key} view={view} access={access} />;
}

function SiteDetailBody({
  view,
  access,
}: {
  view: SiteDetailLifetime;
  access: CloudFeatureAccess;
}) {
  const router = useRouter();
  const colors = useThemeColors();
  const { token, authority, refresh } = view;
  const goBack = useGoBack(SITES_ROUTE);
  const { status: copyStatus, copy } = useCopyAction();
  const [state, setState] = useState<SiteState | null | undefined>(token ? undefined : null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mutation = useRef(false);
  const confirmation = useRef(false);

  useEffect(() => {
    if (!view.isCurrent()) return;
    let active = true;
    loadSite(view)
      .then((next) => {
        if (!active || !view.isCurrent()) return;
        setState(next);
        if (next) setTitle(next.site.title);
      })
      .catch((loadError: unknown) => {
        if (!active || !view.isCurrent()) return;
        setState(null);
        setError(cloudActionError(loadError, 'Could not load this site.'));
      });
    return () => {
      active = false;
    };
  }, [view]);

  const run = useCallback(
    async (key: string, action: () => Promise<unknown>, failure: string) => {
      if (!view.isCurrent() || mutation.current || confirmation.current) return false;
      mutation.current = true;
      setBusy(key);
      setError(null);
      try {
        await action();
        return view.isCurrent();
      } catch (actionError) {
        if (view.isCurrent()) {
          setError(
            actionError instanceof SiteMutationUncertainError
              ? actionError.userMessage
              : cloudActionError(actionError, failure),
          );
        }
        return false;
      } finally {
        if (view.isCurrent()) {
          mutation.current = false;
          setBusy(null);
        }
      }
    },
    [view],
  );

  const takeDown = useCallback(
    async (withData: boolean) => {
      if (!view.isCurrent() || !state || mutation.current || confirmation.current) return;
      confirmation.current = true;
      const name = siteName(state.site);
      const confirmed = await confirmIrreversible({
        title: withData ? `Delete ${name} and its data?` : `Unpublish ${name}?`,
        consequence:
          'The link stops working for everyone, and all shared and personal data visitors saved in this site is permanently erased. The original artifact stays in its chat. The deleted data cannot be recovered.',
        actionLabel: withData ? 'Delete' : 'Unpublish',
      }).finally(() => {
        confirmation.current = false;
      });
      if (!confirmed || !view.isCurrent()) return;
      const done = await run(
        withData ? 'delete' : 'unpublish',
        () =>
          withData
            ? deleteSiteAndData(
                state.site.token,
                Boolean(state.data?.supported && state.data.shared.entryCount > 0),
                authority,
              )
            : unpublishSite(state.site.token, authority),
        withData ? 'Could not delete this site.' : 'Could not unpublish this site.',
      );
      if (done && view.isCurrent())
        router.replace(SITES_ROUTE as Parameters<typeof router.replace>[0]);
    },
    [authority, router, run, state, view],
  );

  const clearData = useCallback(async () => {
    if (!view.isCurrent() || !state || mutation.current || confirmation.current) return;
    confirmation.current = true;
    const confirmed = await confirmIrreversible({
      title: 'Clear shared data?',
      consequence:
        'Everything visitors saved to this page for everyone is erased. Each visitor’s personal data stays theirs. This cannot be undone.',
      actionLabel: 'Clear',
    }).finally(() => {
      confirmation.current = false;
    });
    if (!confirmed || !view.isCurrent()) return;
    if (
      await run(
        'clear',
        () => clearSiteSharedData(state.site.token, authority),
        'Could not clear the data.',
      )
    ) {
      refresh();
    }
  }, [authority, refresh, run, state, view]);

  if (!access.ready) {
    return (
      <CloudFeatureGate
        title="Site"
        feature="Published sites"
        description="Published sites live in AGI Cloud; switching won’t upload your local chats."
        signedIn={access.signedIn}
        onBack={goBack}
        onContinue={access.continueToCloud}
      />
    );
  }

  if (state === undefined || (token && !view.isCurrent())) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
        <ScreenHeader title="Site" onBack={goBack} />
        <LoadingRows count={3} />
      </SafeAreaView>
    );
  }

  if (state === null) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
        <ScreenHeader title="Site" onBack={goBack} />
        <EmptyState
          title="This site is not available"
          body={error ?? 'It was unpublished, or this account cannot manage it.'}
          action={<Button title="Try again" variant="outline" onPress={refresh} />}
        />
      </SafeAreaView>
    );
  }

  const { site, data } = state;
  const visibilities = MANAGED_CLOUD_PUBLISHED_ARTIFACT_VISIBILITIES.filter(
    (visibility) =>
      (visibility !== 'organization' || state.hasWorkspace) &&
      (visibility !== 'invited' || site.visibility === 'invited'),
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
      <ScreenHeader title={siteName(site)} onBack={goBack} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48, gap: 12 }}
      >
        {error ? <ErrorBanner message={error} /> : null}
        <SectionCard title="Link">
          <Text selectable style={{ color: colors.textPrimary, fontSize: typeScale.footnote }}>
            {site.shareUrl}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Button
              title={copyControlLabel(copyStatus, 'Copy link')}
              size="sm"
              variant="outline"
              onPress={() => {
                if (view.isCurrent()) void copy(site.shareUrl);
              }}
            />
            <Button
              title="Share"
              size="sm"
              variant="outline"
              onPress={() => {
                if (view.isCurrent()) void Share.share({ message: site.shareUrl });
              }}
            />
            <Button
              title="Open"
              size="sm"
              variant="outline"
              onPress={() => {
                if (view.isCurrent()) void openUntrustedUrlInAppBrowser(site.shareUrl);
              }}
            />
            {site.conversationId ? (
              <Button
                title="Open its chat"
                size="sm"
                variant="outline"
                onPress={() =>
                  view.isCurrent() &&
                  router.push({
                    pathname: '/(app)/chat/[id]' as const,
                    params: { id: site.conversationId! },
                  })
                }
              />
            ) : null}
          </View>
        </SectionCard>

        <SectionCard title="Who can open it">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {visibilities.map((visibility) => (
              <Chip
                key={visibility}
                label={SITE_VISIBILITY_LABELS[visibility]}
                selected={site.visibility === visibility}
                onPress={
                  site.visibility === visibility || busy
                    ? undefined
                    : () =>
                        void run(
                          'visibility',
                          () => updatePublishedSite(site.token, { visibility }, authority),
                          'Could not change who can open this.',
                        ).then((done) => done && refresh())
                }
              />
            ))}
          </View>
          {!state.hasWorkspace ? (
            <MetaText>Join or create a workspace to limit a site to its members.</MetaText>
          ) : null}
        </SectionCard>

        <SectionCard title="Name">
          <TextField
            label="Site name"
            value={title}
            maxLength={MANAGED_CLOUD_PUBLISHED_ARTIFACT_TITLE_MAX_CHARS}
            onChangeText={(value) => {
              if (view.isCurrent()) setTitle(value);
            }}
          />
          <Button
            title="Rename"
            size="sm"
            loading={busy === 'rename'}
            disabled={busy !== null || !title.trim() || title.trim() === site.title}
            onPress={() =>
              void run(
                'rename',
                () => updatePublishedSite(site.token, { title: title.trim() }, authority),
                'Could not rename this site.',
              ).then((done) => done && refresh())
            }
          />
        </SectionCard>

        {state.versionsFailed ? (
          <SectionCard title="Publish history">
            <ErrorBanner message="Could not load the publish history." onRetry={refresh} />
          </SectionCard>
        ) : state.versions.length > 0 ? (
          <SectionCard title="Publish history">
            {state.versions.map((version) => (
              <View
                key={version.version}
                style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontSize: typeScale.footnote }}>
                    {`Version ${version.version}${version.live ? ' · Live' : ''}`}
                  </Text>
                  <MetaText>{new Date(version.createdAt).toLocaleString()}</MetaText>
                </View>
                {!version.live ? (
                  <Button
                    title="Put live"
                    size="sm"
                    variant="outline"
                    loading={busy === `live:${version.version}`}
                    disabled={busy !== null}
                    accessibilityLabel={`Put version ${version.version} live`}
                    onPress={() =>
                      void run(
                        `live:${version.version}`,
                        () => republishSiteVersion(site, version.version, authority),
                        'Could not put that version live.',
                      ).then((done) => done && refresh())
                    }
                  />
                ) : null}
              </View>
            ))}
          </SectionCard>
        ) : null}

        {state.dataFailed ? (
          <SectionCard title="Data">
            <ErrorBanner message="Could not load what visitors saved." onRetry={refresh} />
          </SectionCard>
        ) : data?.supported ? (
          <SectionCard title="Data" description="What visitors saved through this page.">
            <MetaText>
              {`${data.shared.entryCount} shared ${data.shared.entryCount === 1 ? 'entry' : 'entries'}, ${siteSizeLabel(data.shared.totalBytes)} of ${siteSizeLabel(data.shared.limitBytes)}`}
            </MetaText>
            {data.shared.entries.map((entry) => (
              <View key={entry.key} style={{ gap: 2 }}>
                <Text
                  style={{
                    color: colors.textPrimary,
                    fontSize: typeScale.footnote,
                    fontWeight: '600',
                  }}
                >
                  {entry.key}
                </Text>
                <MetaText>{entry.truncated ? `${entry.preview}…` : entry.preview}</MetaText>
              </View>
            ))}
            {data.shared.entryCount > 0 ? (
              <Button
                title="Clear shared data"
                size="sm"
                variant="outline"
                loading={busy === 'clear'}
                disabled={busy !== null}
                onPress={() => void clearData()}
              />
            ) : null}
          </SectionCard>
        ) : null}

        <SectionCard title="Take it down">
          <Button
            title="Unpublish"
            variant="outline"
            loading={busy === 'unpublish'}
            disabled={busy !== null}
            onPress={() => void takeDown(false)}
          />
          <Button
            title="Delete site and its data"
            variant="destructive"
            loading={busy === 'delete'}
            disabled={busy !== null}
            onPress={() => void takeDown(true)}
          />
        </SectionCard>
      </ScrollView>
    </SafeAreaView>
  );
}
