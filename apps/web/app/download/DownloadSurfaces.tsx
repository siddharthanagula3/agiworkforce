'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  Code2,
  Download,
  Globe,
  Monitor,
  PanelRight,
  Smartphone,
  SquareTerminal,
  type LucideIcon,
} from 'lucide-react';
import { Section, Stack } from '@/features/marketing/components/system';
import { NAV_GROUPS, WEB_ENTRY_HREF } from '@/features/marketing/components/system/nav';
import { PublicWaitlistForm } from '@/features/marketing/components/PublicWaitlistForm';
import { SUPPORTED_BROWSERS } from '@/lib/browser-support';
import {
  AVAILABLE_NOW_LABEL,
  NOTIFY_CTA,
  NOTIFY_FORM_ID,
  SURFACE_IDS,
  SURFACE_NAMES,
  SURFACE_PLATFORMS,
  SURFACE_STATUS,
  isReleased,
  joinSurfaceNames,
  surfaceCta,
  type SurfaceId,
  type SurfaceStatusMap,
} from '@/lib/surface-status';
import { ARCHITECTURE_LABELS, macDownloadHref, useDesktopRelease } from './use-desktop-release';
import { CLI_PLATFORM_LABELS, useCliRelease, type CliAvailability } from './use-cli-release';
import type { MacArchitecture } from './detect-architecture';

const DESKTOP_APP_PATH = '/Applications/AGI Cloud.app';

const SURFACE_HREFS: Record<SurfaceId, string> = {
  web: '/web',
  desktop: '/desktop',
  cli: '/cli',
  mobile: '/mobile',
  vscode: '/vscode-extension',
  chrome: '/chrome-extension',
};

const SURFACE_ANCHORS: Partial<Record<SurfaceId, string>> = {
  desktop: 'desktop-downloads',
  cli: 'cli-downloads',
};

const SURFACE_ICONS: Record<SurfaceId, LucideIcon> = {
  web: Globe,
  desktop: Monitor,
  cli: SquareTerminal,
  mobile: Smartphone,
  vscode: Code2,
  chrome: PanelRight,
};

const OTHER_MAC: Record<MacArchitecture, string> = {
  arm64: 'a Mac with Apple silicon',
  x64: 'an Intel Mac',
};

const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

function surfaceNav(surface: SurfaceId) {
  const item = NAV_ITEMS.find((entry) => entry.href === SURFACE_HREFS[surface]);
  return { name: item?.label ?? SURFACE_NAMES[surface], description: item?.description };
}

const BROWSER_LIST = joinSurfaceNames(SUPPORTED_BROWSERS);

const NOTIFY_SURFACES = SURFACE_IDS.filter(
  (surface) => surface !== 'web' && surfaceCta(surface) === NOTIFY_CTA,
);

function platformLine(surface: SurfaceId): string {
  return surface === 'web' ? BROWSER_LIST : joinSurfaceNames(SURFACE_PLATFORMS[surface]);
}

function otherArchitecture(
  offered: readonly MacArchitecture[],
  recommended: MacArchitecture,
): MacArchitecture | undefined {
  return offered.find((architecture) => architecture !== recommended);
}

function WebHero({ preview }: { preview: ReactNode }) {
  const unreleased = SURFACE_IDS.filter((surface) => !isReleased(surface)).map(
    (surface) => SURFACE_NAMES[surface],
  );
  return (
    <HeroFrame preview={preview}>
      <p className="agi-dl-status">
        <span className="agi-dl-dot" aria-hidden="true" />
        {surfaceNav('web').name} is {SURFACE_STATUS.web.toLowerCase()}
      </p>
      <h1 className="agi-dl-title" id="agi-download-hero-title">
        Use AGI today, in your browser
      </h1>
      <p className="agi-dl-lede">
        Chat, projects and artifacts work in any current browser, with nothing to install.
        {unreleased.length > 0 ? ` The ${joinSurfaceNames(unreleased)} apps are on their way.` : ''}
      </p>
      <div className="agi-ds-btn-row">
        <Link href={WEB_ENTRY_HREF} className="agi-ds-btn" data-variant="primary">
          Open AGI Web
        </Link>
        {NOTIFY_SURFACES.length > 0 ? (
          <a href={`#${NOTIFY_FORM_ID}`} className="agi-ds-btn" data-variant="secondary">
            Get notified about the apps
          </a>
        ) : null}
      </div>
      <p className="agi-dl-fine">Works in current {BROWSER_LIST}.</p>
    </HeroFrame>
  );
}

function MacHero({
  preview,
  version,
  offered,
  recommended,
  detected,
}: {
  preview: ReactNode;
  version: string;
  offered: MacArchitecture[];
  recommended: MacArchitecture;
  detected: MacArchitecture | 'unknown';
}) {
  const other = otherArchitecture(offered, recommended);
  return (
    <HeroFrame preview={preview}>
      <p className="agi-dl-status">
        <span className="agi-dl-dot" aria-hidden="true" />
        {surfaceNav('desktop').name} for Mac is available · version {version}
      </p>
      <h1 className="agi-dl-title" id="agi-download-hero-title">
        AGI for Mac
      </h1>
      <p className="agi-dl-lede">
        {surfaceNav('desktop').description}. One signed and notarized installer for each Mac
        processor.
      </p>
      <div className="agi-ds-btn-row">
        <a
          href={macDownloadHref(recommended)}
          className="agi-ds-btn"
          data-variant="primary"
          aria-describedby="agi-download-arch"
        >
          <Download aria-hidden="true" className="agi-dl-btn-icon" />
          Download for Mac
        </a>
        <Link href={WEB_ENTRY_HREF} className="agi-ds-btn" data-variant="secondary">
          Open AGI Web
        </Link>
      </div>
      <p className="agi-dl-fine" id="agi-download-arch">
        {detected === recommended
          ? `Detected: ${ARCHITECTURE_LABELS[recommended]}.`
          : detected === 'unknown'
            ? `This is the ${ARCHITECTURE_LABELS[recommended]} version. Apple menu, then About This Mac, names your processor.`
            : `This release is published for ${ARCHITECTURE_LABELS[recommended]} only.`}
        {other ? (
          <>
            {` On ${OTHER_MAC[other]}? `}
            <a href={macDownloadHref(other)} className="agi-dl-link">
              Download the {ARCHITECTURE_LABELS[other]} version
            </a>
            .
          </>
        ) : null}
      </p>
    </HeroFrame>
  );
}

function HeroFrame({ preview, children }: { preview: ReactNode; children: ReactNode }) {
  return (
    <section className="agi-lp-hero agi-dl-hero" aria-labelledby="agi-download-hero-title">
      <div className="agi-ds-container agi-lp-hero-grid">
        <div className="agi-lp-hero-copy agi-dl-hero-copy">{children}</div>
        <div className="agi-lp-hero-stage">{preview}</div>
      </div>
    </section>
  );
}

function StatusBadge({ label }: { label: string }) {
  return (
    <span className="agi-dl-badge" data-available={label === AVAILABLE_NOW_LABEL || undefined}>
      {label}
    </span>
  );
}

function CliArchives({ availability }: { availability: CliAvailability }) {
  if (availability.state !== 'available') return null;
  return (
    <>
      <span>Version {availability.version}</span>
      <ul className="agi-dl-archives" aria-label="CLI archives">
        {availability.downloads.map((download) => (
          <li key={download.platform}>
            <a
              href={download.downloadUrl}
              className="agi-ds-btn"
              data-variant="secondary"
              rel="noreferrer"
              aria-label={`Download ${download.assetName}`}
            >
              {CLI_PLATFORM_LABELS[download.platform]}
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

function SurfaceRow({
  surface,
  statuses,
  action,
  extra,
}: {
  surface: SurfaceId;
  statuses: SurfaceStatusMap;
  action: ReactNode;
  extra?: ReactNode;
}) {
  const Icon = SURFACE_ICONS[surface];
  const nav = surfaceNav(surface);
  return (
    <li className="agi-dl-row" id={SURFACE_ANCHORS[surface]} data-surface={surface}>
      <span className="agi-dl-icon" aria-hidden="true">
        <Icon />
      </span>
      <span className="agi-dl-name">
        <Link href={SURFACE_HREFS[surface]} className="agi-dl-name-link">
          {nav.name}
        </Link>
        <span className="agi-dl-platforms">{platformLine(surface)}</span>
      </span>
      <span className="agi-dl-what">
        {nav.description ? <span>{nav.description}.</span> : null}
        {extra}
      </span>
      <span className="agi-dl-act">
        <StatusBadge label={statuses[surface]} />
        {action}
      </span>
    </li>
  );
}

export function DownloadSurfaces({
  webPreview,
  desktopPreview,
}: {
  webPreview: ReactNode;
  desktopPreview: ReactNode;
}) {
  const desktop = useDesktopRelease();
  const cli = useCliRelease();
  const desktopRelease =
    desktop.availability.state === 'available' && desktop.recommended
      ? { version: desktop.availability.version, recommended: desktop.recommended }
      : null;

  const statuses: SurfaceStatusMap = {
    ...SURFACE_STATUS,
    ...(desktopRelease ? { desktop: AVAILABLE_NOW_LABEL } : {}),
    ...(cli.availability.state === 'available' ? { cli: AVAILABLE_NOW_LABEL } : {}),
  };

  function actionFor(surface: SurfaceId): ReactNode {
    if (surface === 'web') {
      return (
        <Link href={WEB_ENTRY_HREF} className="agi-ds-btn" data-variant="primary">
          Open AGI Web
        </Link>
      );
    }
    if (surface === 'desktop') {
      if (desktopRelease) {
        return (
          <a
            href={macDownloadHref(desktopRelease.recommended)}
            className="agi-ds-btn"
            data-variant="primary"
          >
            Download for Mac
          </a>
        );
      }
      if (desktop.availability.state === 'error') {
        return (
          <button
            type="button"
            className="agi-ds-btn"
            data-variant="secondary"
            onClick={desktop.retry}
          >
            Retry release check
          </button>
        );
      }
      return null;
    }
    if (surface === 'cli') {
      if (cli.availability.state === 'error') {
        return (
          <button type="button" className="agi-ds-btn" data-variant="secondary" onClick={cli.retry}>
            Retry release check
          </button>
        );
      }
      return null;
    }
    const cta = surfaceCta(surface, statuses);
    return cta === NOTIFY_CTA ? (
      <a
        href={`#${NOTIFY_FORM_ID}`}
        className="agi-ds-btn"
        data-variant="secondary"
        aria-label={`${cta.label} about ${surfaceNav(surface).name}`}
      >
        {cta.label}
      </a>
    ) : (
      <Link href={cta.href} className="agi-ds-btn" data-variant="primary">
        {cta.label}
      </Link>
    );
  }

  function extraFor(surface: SurfaceId): ReactNode {
    if (surface === 'desktop' && desktop.availability.state === 'error') {
      return (
        <span role="alert" className="agi-dl-note">
          We could not check for a Desktop release.
        </span>
      );
    }
    if (surface === 'cli' && cli.availability.state === 'error') {
      return (
        <span role="alert" className="agi-dl-note">
          We could not verify the CLI archives.
        </span>
      );
    }
    if (surface === 'cli') return <CliArchives availability={cli.availability} />;
    return null;
  }

  const installer =
    desktopRelease &&
    (desktop.checksums.find((checksum) => checksum.architecture === desktopRelease.recommended)
      ?.name ??
      `AGI-Cloud-${desktopRelease.version}-${desktopRelease.recommended}.dmg`);

  return (
    <>
      {desktopRelease ? (
        <MacHero
          preview={desktopPreview}
          version={desktopRelease.version}
          offered={desktop.offered}
          recommended={desktopRelease.recommended}
          detected={desktop.detected}
        />
      ) : (
        <WebHero preview={webPreview} />
      )}

      <Section id="apps" labelledBy="agi-download-apps-title" rule>
        <Stack gap="loose">
          <div className="agi-dl-head">
            <h2 className="agi-dl-h2" id="agi-download-apps-title">
              Every way to use AGI
            </h2>
            <p className="agi-dl-sub">One account works across all of them.</p>
          </div>
          <ul className="agi-dl-list" aria-label="Every way to use AGI">
            {SURFACE_IDS.map((surface) => (
              <SurfaceRow
                key={surface}
                surface={surface}
                statuses={statuses}
                action={actionFor(surface)}
                extra={extraFor(surface)}
              />
            ))}
          </ul>
        </Stack>
      </Section>

      {NOTIFY_SURFACES.length > 0 ? (
        <Section id={NOTIFY_FORM_ID} labelledBy="agi-download-notify-title" rule>
          <div className="agi-dl-notify">
            <div className="agi-dl-notify-copy">
              <h2 className="agi-dl-h2" id="agi-download-notify-title">
                Hear when an app is ready
              </h2>
              <p className="agi-dl-sub">
                Leave your email and we will write when{' '}
                {joinSurfaceNames(NOTIFY_SURFACES.map((surface) => surfaceNav(surface).name))}{' '}
                {NOTIFY_SURFACES.length > 1 ? 'have' : 'has'} a verified installer, and for nothing
                else.
              </p>
            </div>
            <PublicWaitlistForm source="other" ctaLabel={NOTIFY_CTA.label} />
          </div>
        </Section>
      ) : null}

      {desktopRelease ? (
        <Section id="verify" labelledBy="agi-download-verify-title" rule>
          <details className="agi-dl-verify">
            <summary>
              <span id="agi-download-verify-title">Verify your download</span>
              <span className="agi-dl-verify-hint">Checksums, signature and notarization</span>
            </summary>
            <div className="agi-dl-verify-body">
              <p>Compare the file you downloaded with the SHA-256 the release run published.</p>
              <pre>{`shasum -a 256 ~/Downloads/${installer}`}</pre>
              {desktop.checksums.length > 0 ? (
                <ul className="agi-dl-checksums" aria-label="Installer checksums">
                  {desktop.checksums.map((checksum) => (
                    <li key={checksum.name}>
                      <span>{checksum.name}</span>
                      <code>{checksum.sha256}</code>
                    </li>
                  ))}
                </ul>
              ) : null}
              <p>
                Once the app is in Applications, check that it carries our signature and that
                Apple&apos;s notarization ticket is attached.
              </p>
              <pre>{`codesign -dv --verbose=4 "${DESKTOP_APP_PATH}"\nxcrun stapler validate ~/Downloads/${installer}`}</pre>
            </div>
          </details>
        </Section>
      ) : null}
    </>
  );
}
