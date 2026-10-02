import manifest from '@/content/legal/policy-archive/manifest.json';
import { ARCHIVED_POLICY_TEXT } from '@/content/legal/policy-archive';

export interface PolicySegment {
  text: string;
  href?: string;
  strong?: boolean;
  em?: boolean;
  code?: boolean;
}

export type PolicyBlock =
  | { type: 'heading'; level: number; anchor?: string; content: PolicySegment[] }
  | { type: 'paragraph'; content: PolicySegment[] }
  | { type: 'eyebrow'; content: PolicySegment[] }
  | { type: 'list'; items: PolicySegment[][] }
  | {
      type: 'rows';
      caption?: string;
      rows: { label: PolicySegment[]; value: PolicySegment[] }[];
    }
  | { type: 'table'; header: string[]; rows: PolicySegment[][][] };

export interface ArchivedPolicyText {
  key: string;
  route: string;
  date: string;
  replacedOn: string | null;
  commit: string;
  committedAt: string;
  title: string;
  blocks: PolicyBlock[];
}

export type PolicyVersionStatus = 'current' | 'archived' | 'not-retained';

export interface PolicyVersionEntry {
  date: string;
  summary: string | null;
  status: PolicyVersionStatus;
  published: boolean | null;
}

export interface PolicyHistory {
  key: string;
  label: string;
  route: string;
  slug: string;
  current: string;
  versions: PolicyVersionEntry[];
}

const POLICY_LABELS: Readonly<Record<string, string>> = {
  terms: 'Terms of service',
  privacy: 'Privacy policy',
  acceptableUse: 'Acceptable use policy',
  dpa: 'Data processing agreement',
  cookies: 'Cookie policy',
  subprocessors: 'Subprocessors',
  security: 'Security',
  sla: 'Service level agreement',
  refunds: 'Refund policy',
  referralTerms: 'Referral program terms',
  accessibility: 'Accessibility',
  trust: 'Trust posture',
  euRepresentative: 'EU representative',
  mobile: 'Mobile app terms and privacy',
  copyright: 'Copyright and IP complaints',
  indiaPrivacy: 'India: DPDP notice',
  dataRights: 'Data rights and consent',
  dataUse: 'How we use your data',
  disclaimer: 'Disclaimer',
  agentPermissions: 'Approvals',
};

const ARCHIVE_ROOT = '/legal/archive';

const ARCHIVED: Readonly<Record<string, Readonly<Record<string, unknown>>>> = ARCHIVED_POLICY_TEXT;

const HISTORIES: readonly PolicyHistory[] = Object.entries(manifest.policies).map(
  ([key, policy]) => ({
    key,
    label: POLICY_LABELS[key] ?? policy.route,
    route: policy.route,
    slug: policy.slug,
    current: policy.current,
    versions: policy.versions.map((version) => ({
      date: version.date,
      summary: version.summary,
      status: version.status as PolicyVersionStatus,
      published: version.published,
    })),
  }),
);

export function policyHistories(): readonly PolicyHistory[] {
  return HISTORIES;
}

export function policyHistoryBySlug(slug: string): PolicyHistory | null {
  return HISTORIES.find((history) => history.slug === slug) ?? null;
}

export function policyHistoryForKey(key: string): PolicyHistory | null {
  return HISTORIES.find((history) => history.key === key) ?? null;
}

export function archivedPolicyText(key: string, date: string): ArchivedPolicyText | null {
  const text = ARCHIVED[key]?.[date];
  return text ? (text as ArchivedPolicyText) : null;
}

export function policyHistoryHref(history: PolicyHistory): string {
  return `${ARCHIVE_ROOT}/${history.slug}`;
}

export function archivedVersionHref(history: PolicyHistory, date: string): string {
  return `${ARCHIVE_ROOT}/${history.slug}/${date}`;
}

export function olderArchivedVersion(history: PolicyHistory, date: string): string | null {
  const position = history.versions.findIndex((version) => version.date === date);
  const older = history.versions
    .slice(position + 1)
    .find((version) => version.status === 'archived');
  return older?.date ?? null;
}

export function versionStanding(history: PolicyHistory, date: string): string | null {
  const position = history.versions.findIndex((version) => version.date === date);
  const version = history.versions[position];
  const newer = history.versions.slice(0, Math.max(position, 0)).reverse();
  const [replacement] = newer;
  if (!version || version.status === 'current' || !replacement) return null;
  if (version.published === false) {
    return `This version was settled on ${version.date} and replaced on ${replacement.date} before it was published on this site.`;
  }
  if (version.published === null) {
    return `This version was replaced by the version dated ${replacement.date}.`;
  }
  const successor = newer.find((entry) => entry.published !== false) ?? replacement;
  return `This version applied until the version dated ${successor.date} replaced it on this site.`;
}

const LONG_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function publicationFloor(): { date: string; label: string } {
  const [date] = manifest.publicationsCheckedOn;
  if (!date) {
    throw new Error('The policy archive manifest records no check of what production served');
  }
  return { date, label: LONG_DATE.format(new Date(`${date}T00:00:00Z`)) };
}

export const POLICY_PUBLICATION_FLOOR = publicationFloor();

export interface PolicyChange {
  history: PolicyHistory;
  date: string;
  summary: string;
  href: string;
  introduced: boolean;
}

function versionHref(history: PolicyHistory, version: PolicyVersionEntry): string {
  if (version.status === 'current') return history.route;
  if (version.status === 'archived') return archivedVersionHref(history, version.date);
  return policyHistoryHref(history);
}

const CHANGES: readonly PolicyChange[] = HISTORIES.flatMap((history) =>
  history.versions.flatMap((version, position) =>
    version.summary
      ? [
          {
            history,
            date: version.date,
            summary: version.summary,
            href: versionHref(history, version),
            introduced:
              position === history.versions.length - 1 && version.date > manifest.recordedSince,
          },
        ]
      : [],
  ),
).sort((left, right) => right.date.localeCompare(left.date));

export function policyChanges(): readonly PolicyChange[] {
  return CHANGES;
}

export function policyChangeTitle(change: PolicyChange): string {
  return `${change.history.label} ${change.introduced ? 'introduced' : 'updated'}`;
}
