import Link from 'next/link';
import { SettingsModalRedirect } from '@/features/settings/components/SettingsModalRedirect';
import { Prose, Section, Stack } from '@/features/marketing/components/system';
import { pluginAvailabilityClaim, pluginStatusLabel } from '@/features/plugins/availability';
import {
  loadPluginCatalog,
  type PluginCatalogResult,
} from '@/features/plugins/server/registry-source';
import { getRequestIdentity } from '@/lib/server/identity';
import { SignedOutSurface } from '@shared/components/marketing/SignedOutSurface';
import { reportUnreadableIdentity } from '@/lib/server/unreadable-identity';
import { CONNECTORS_COMING_SOON_DETAIL, connectorsReleased } from '@agiworkforce/types';

const CATALOGUE_PATH = '/plugins';
const CATALOGUE_TITLE_ID = 'agi-apps-catalogue-title';
const RESTING_UNDERLINE = { backgroundSize: '100% 1px' } as const;
const APP_DEFINITION =
  'An app is a pack you install into the assistant. On the web, installing one adds the skills it declares and connects no service by itself.';
const CATALOGUE_ACCESS =
  'The catalogue below is public. Installing an app needs an account, and which apps you can install depends on your workspace.';
const LEDE = [
  APP_DEFINITION,
  ...(connectorsReleased() ? [] : [CONNECTORS_COMING_SOON_DETAIL]),
  CATALOGUE_ACCESS,
].join(' ');

async function isSignedIn(): Promise<boolean> {
  try {
    return (await getRequestIdentity()).isSignedIn;
  } catch (error) {
    reportUnreadableIdentity(error, '/apps');
    return false;
  }
}

function AppsCatalogue({ catalog }: { catalog: PluginCatalogResult }) {
  return (
    <Section id="apps-catalogue" labelledBy={CATALOGUE_TITLE_ID} rule>
      <Stack gap="loose">
        <h2 className="agi-ds-h2" id={CATALOGUE_TITLE_ID}>
          The public catalogue.
        </h2>
        <p className="agi-ds-prose" role="status">
          {pluginAvailabilityClaim(catalog)}
        </p>
        {catalog.status === 'ok' && catalog.entries.length > 0 ? (
          <>
            <Stack gap="loose">
              {catalog.entries.map((entry) => (
                <Stack gap="tight" key={entry.id}>
                  <h3 className="agi-ds-h3">
                    <Link
                      href={`${CATALOGUE_PATH}/${entry.id}`}
                      className="agi-ds-link"
                      style={RESTING_UNDERLINE}
                    >
                      {entry.name}
                    </Link>
                  </h3>
                  <Prose>{entry.description}</Prose>
                  <Prose>{pluginStatusLabel(entry)}</Prose>
                </Stack>
              ))}
            </Stack>
            <Prose>
              Each entry opens its own page, and{' '}
              <Link href={CATALOGUE_PATH} className="agi-ds-link">
                the plugins page
              </Link>{' '}
              explains what a status means.
            </Prose>
          </>
        ) : null}
      </Stack>
    </Section>
  );
}

export default async function AppsPage() {
  if (await isSignedIn()) {
    return <SettingsModalRedirect section="plugins" />;
  }

  return (
    <SignedOutSurface
      eyebrow="Apps"
      heading="Apps are packs you install into AGI"
      signInHref="/login?redirectTo=%2Fapps"
      signInLabel="Sign in to install apps"
      secondary={{ href: '/features/plugins', label: 'How apps and plugins work' }}
      after={<AppsCatalogue catalog={await loadPluginCatalog()} />}
    >
      {LEDE}
    </SignedOutSurface>
  );
}
