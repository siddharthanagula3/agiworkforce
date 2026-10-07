import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { buildMetadata } from '@/lib/seo/metadata';
import { getSnapshotRecords, getSnapshotView } from '@/lib/connectors/directory/memory-cache';
import { isConnectableNow, networkRemoteUrl } from '@/lib/connectors/directory/snapshot-view';
import type { DirectoryRecord } from '@/lib/connectors/directory/types';
import { Header } from '@shared/components/layout/Header';
import {
  Ledger,
  MarketingFooter,
  Prose,
  Section,
  Stack,
  type LedgerRow,
} from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import {
  AUTH_MODE_LABELS,
  BADGE_LABELS,
  BADGE_NOTE,
  BASE_PATH,
  CONNECT_LABEL,
  NOT_PROVIDED,
  SIGN_IN_HREF,
  SOURCE_LABELS,
  directoryRecordIdCandidates,
  directoryRecordPath,
  isIndexableDirectoryRecord,
  safeExternalUrl,
} from '../directory-public';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string[] }>;
}

function findRecord(records: readonly DirectoryRecord[], segments: readonly string[]) {
  for (const id of directoryRecordIdCandidates(segments)) {
    const record = records.find((entry) => entry.id === id && isConnectableNow(entry));
    if (record) return record;
  }
  return undefined;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const record = findRecord(await getSnapshotRecords(), id);
  if (!record) return { robots: { index: false, follow: false } };

  return buildMetadata({
    title: `${record.name} MCP connector`,
    description:
      record.description.trim().slice(0, 155) ||
      `Publisher, sign-in requirement and listed tools for ${record.name}.`,
    path: directoryRecordPath(record.id),
    robots: isIndexableDirectoryRecord(record) ? undefined : { index: false, follow: true },
  });
}

function publisherLink(value: string | null, label: string) {
  const href = safeExternalUrl(value);
  return href ? (
    <a href={href} className="agi-ds-link" rel="nofollow noopener noreferrer">
      {label}
    </a>
  ) : (
    NOT_PROVIDED
  );
}

function endpointHost(record: DirectoryRecord): string {
  const href = safeExternalUrl(networkRemoteUrl(record));
  return href ? new URL(href).host : NOT_PROVIDED;
}

function refreshLabel(value: string | null): string {
  if (!value) return NOT_PROVIDED;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? NOT_PROVIDED : date.toISOString();
}

export default async function ConnectorDetailPage({ params }: PageProps) {
  const { id } = await params;
  const snapshot = await getSnapshotView();
  const record = findRecord(snapshot.records, id);
  if (!record) notFound();

  const authorHref = safeExternalUrl(record.authorUrl);
  const author = record.authorName?.trim();
  const rows: LedgerRow[] = [
    { label: 'Publisher', value: record.publisher || NOT_PROVIDED },
    {
      label: 'Author',
      value: author && authorHref ? publisherLink(authorHref, author) : author || NOT_PROVIDED,
    },
    { label: 'Listed from', value: SOURCE_LABELS[record.sourceRegistry] },
    { label: 'Sign-in at the provider', value: AUTH_MODE_LABELS[record.authMode] },
    { label: 'Endpoint host', value: endpointHost(record) },
    { label: 'Version', value: record.version || NOT_PROVIDED },
    { label: 'Documentation', value: publisherLink(record.documentationUrl, 'Documentation') },
    { label: 'Website', value: publisherLink(record.websiteUrl, 'Website') },
    { label: 'Source', value: publisherLink(record.repositoryUrl, 'Source repository') },
    { label: 'Support', value: publisherLink(record.supportUrl, 'Support') },
    { label: 'Privacy policy', value: publisherLink(record.privacyPolicyUrl, 'Privacy policy') },
    {
      label: 'Index refreshed',
      value: `${refreshLabel(snapshot.lastSyncAt)}. This is not a review of this connector.`,
    },
  ];

  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-connector-title"
          eyebrow="Connectors · MCP directory"
          title={record.name}
          lede={record.description.trim() || 'The publisher has not provided a description.'}
          ctas={[
            { href: SIGN_IN_HREF, label: CONNECT_LABEL },
            { href: BASE_PATH, label: 'Back to the directory', variant: 'secondary' },
          ]}
        />
        <Section size="xs" labelledBy="agi-connector-record-title" rule>
          <Stack gap="base" className="agi-ds-full">
            <h2 id="agi-connector-record-title" className="agi-ds-h2">
              About this connector.
            </h2>
            <Prose>
              <strong>{BADGE_LABELS[record.badge]}.</strong> {BADGE_NOTE}
            </Prose>
            <Prose>
              Reading this page connects nothing. After you sign in and choose Connect, the provider
              asks for its own sign-in or key where it needs one, and every tool stays behind your
              per-tool permission.
            </Prose>
            <Ledger caption="The record" rows={rows} />
          </Stack>
        </Section>
        <Section size="xs" labelledBy="agi-connector-tools-title" rule>
          <Stack gap="base" className="agi-ds-full">
            <h2 id="agi-connector-tools-title" className="agi-ds-h2">
              Listed tools.
            </h2>
            {record.toolNames.length === 0 ? (
              <Prose>Tool list not published.</Prose>
            ) : (
              <>
                <Prose>
                  {record.toolNames.length.toLocaleString()} listed{' '}
                  {record.toolNames.length === 1 ? 'tool' : 'tools'}. Names as the server lists
                  them; AGI has not grouped or reviewed them.
                </Prose>
                <ul className="grid w-full gap-2 sm:grid-cols-2">
                  {record.toolNames.map((name, index) => (
                    <li key={`${index}:${name}`} className="min-w-0 break-words">
                      <code>{name}</code>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
