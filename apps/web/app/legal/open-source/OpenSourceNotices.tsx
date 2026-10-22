'use client';

import { useCallback, useMemo, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { Spinner } from '@agiworkforce/ui';
import { Section, Stack } from '@/features/marketing/components/system';
import {
  NOTICE_SOURCE_LABEL,
  groupByLicense,
  numberTexts,
  type LicenseGroup,
  type NoticePackage,
  type NoticesSummary,
  type ThirdPartyNotices,
} from './notices';

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; notices: ThirdPartyNotices };

interface LoadedNotices {
  groups: Map<string, LicenseGroup>;
  texts: Map<number, string>;
  textNumbers: Map<string, number>;
}

function packageCount(count: number): string {
  return count === 1 ? '1 package' : `${count} packages`;
}

function textAnchor(number: number): string {
  return `license-text-${number}`;
}

function PackageRow({
  pkg,
  textNumbers,
  showSources,
}: {
  pkg: NoticePackage;
  textNumbers: ReadonlyMap<string, number>;
  showSources: boolean;
}) {
  const label = `${pkg.name} ${pkg.version}`;
  const numbers = pkg.textIds.flatMap((id) => {
    const number = textNumbers.get(id);
    return number === undefined ? [] : [number];
  });
  return (
    <li className="agi-oss-package">
      {pkg.url ? (
        <a href={pkg.url} className="agi-ds-link" rel="noopener noreferrer" target="_blank">
          {label}
        </a>
      ) : (
        <span>{label}</span>
      )}
      {showSources ? (
        <span className="agi-oss-meta">
          {pkg.sources.map((source) => NOTICE_SOURCE_LABEL[source]).join(', ')}
        </span>
      ) : null}
      {numbers.map((number) => (
        <a key={number} href={`#${textAnchor(number)}`} className="agi-oss-meta agi-ds-link">
          Text {number}
        </a>
      ))}
      {pkg.copyright.length > 0 ? (
        <span className="agi-oss-copyright">{pkg.copyright.join('\n')}</span>
      ) : null}
    </li>
  );
}

function NoticeDetails({
  id,
  title,
  count,
  state,
  onOpen,
  onRetry,
  children,
}: {
  id?: string;
  title: string;
  count: number;
  state: LoadState['status'];
  onOpen: () => void;
  onRetry: () => void;
  children: () => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const handleToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    const next = event.currentTarget.open;
    setOpen(next);
    if (next) onOpen();
  };
  return (
    <details className="agi-oss-group" id={id} onToggle={handleToggle}>
      <summary className="agi-oss-summary">
        <span className="agi-oss-summary-title">{title}</span>
        <span className="agi-oss-meta">{packageCount(count)}</span>
      </summary>
      {open && state === 'ready' ? children() : null}
      {open && (state === 'loading' || state === 'idle') ? (
        <div className="agi-oss-status">
          <Spinner size="sm" />
        </div>
      ) : null}
      {open && state === 'failed' ? (
        <div className="agi-oss-status">
          <p className="agi-oss-meta">The notices could not be loaded.</p>
          <button type="button" className="agi-ds-btn" data-variant="secondary" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : null}
    </details>
  );
}

export function OpenSourceNotices({ summary, url }: { summary: NoticesSummary; url: string }) {
  const [state, setState] = useState<LoadState>({ status: 'idle' });

  const requested = useRef(false);

  const load = useCallback(() => {
    if (requested.current) return;
    requested.current = true;
    setState({ status: 'loading' });
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<ThirdPartyNotices>;
      })
      .then((notices) => setState({ status: 'ready', notices }))
      .catch(() => {
        requested.current = false;
        setState({ status: 'failed' });
      });
  }, [url]);

  const loaded = useMemo<LoadedNotices | null>(() => {
    if (state.status !== 'ready') return null;
    const texts = numberTexts(state.notices);
    return {
      groups: new Map(
        groupByLicense(state.notices.packages).map((group) => [group.license, group]),
      ),
      texts: new Map(texts.map((text) => [text.number, text.body])),
      textNumbers: new Map(texts.map((text) => [text.id, text.number])),
    };
  }, [state]);

  const showSources = summary.products.length > 1;

  return (
    <>
      <Section id="packages" labelledBy="agi-open-source-packages-title" rule>
        <Stack gap="loose">
          <h2 className="agi-ds-h2" id="agi-open-source-packages-title">
            Packages by license.
          </h2>
          <div className="agi-oss-groups">
            {summary.groups.map((group) => (
              <NoticeDetails
                key={group.license}
                title={group.license}
                count={group.count}
                state={state.status}
                onOpen={load}
                onRetry={load}
              >
                {() => (
                  <ul className="agi-oss-packages">
                    {loaded?.groups.get(group.license)?.packages.map((pkg) => (
                      <PackageRow
                        key={`${pkg.ecosystem}:${pkg.name}@${pkg.version}`}
                        pkg={pkg}
                        textNumbers={loaded.textNumbers}
                        showSources={showSources}
                      />
                    ))}
                  </ul>
                )}
              </NoticeDetails>
            ))}
          </div>
        </Stack>
      </Section>

      <Section id="license-texts" labelledBy="agi-open-source-texts-title" rule>
        <Stack gap="loose">
          <h2 className="agi-ds-h2" id="agi-open-source-texts-title">
            License texts.
          </h2>
          <div className="agi-oss-groups">
            {summary.texts.map((text) => (
              <NoticeDetails
                key={text.number}
                id={textAnchor(text.number)}
                title={`Text ${text.number}. ${text.title}`}
                count={text.usedBy}
                state={state.status}
                onOpen={load}
                onRetry={load}
              >
                {() => <pre className="agi-oss-text">{loaded?.texts.get(text.number)}</pre>}
              </NoticeDetails>
            ))}
          </div>
        </Stack>
      </Section>
    </>
  );
}
