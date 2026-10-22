import { PRODUCT_NAMES } from '@agiworkforce/types';

export type NoticeSource = 'web' | 'desktop' | 'cli';

export interface NoticePackage {
  ecosystem: 'npm' | 'cargo';
  name: string;
  version: string;
  license: string;
  url: string | null;
  copyright: string[];
  textIds: string[];
  sources: NoticeSource[];
}

export interface ThirdPartyNotices {
  texts: Record<string, string>;
  packages: NoticePackage[];
}

export interface LicenseGroup {
  license: string;
  packages: NoticePackage[];
}

export interface NoticeText {
  id: string;
  number: number;
  title: string;
  body: string;
  usedBy: number;
}

export interface NoticesSummary {
  products: string[];
  packageCount: number;
  groups: { license: string; count: number }[];
  texts: { number: number; title: string; usedBy: number }[];
}

export const NOTICE_SOURCE_LABEL: Record<NoticeSource, string> = {
  web: PRODUCT_NAMES.chat,
  desktop: PRODUCT_NAMES.desktop,
  cli: PRODUCT_NAMES.cli,
};

const NOTICE_SOURCE_ORDER: NoticeSource[] = ['web', 'desktop', 'cli'];

export function licenseGroupKey(license: string): string {
  const expression = license.trim().replace(/\s*\/\s*/g, ' OR ');
  if (/[()]|\sAND\s|\sWITH\s/i.test(expression)) return expression;
  const choices = [...new Set(expression.split(/\s+OR\s+/i).map((choice) => choice.trim()))];
  return choices.sort((a, b) => a.localeCompare(b)).join(' OR ');
}

export function groupByLicense(packages: NoticePackage[]): LicenseGroup[] {
  const groups = new Map<string, LicenseGroup>();
  for (const pkg of packages) {
    const license = licenseGroupKey(pkg.license);
    const group = groups.get(license);
    if (group) group.packages.push(pkg);
    else groups.set(license, { license, packages: [pkg] });
  }
  const result = [...groups.values()];
  for (const group of result) {
    group.packages.sort(
      (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
    );
  }
  return result.sort(
    (a, b) => b.packages.length - a.packages.length || a.license.localeCompare(b.license),
  );
}

function titleOf(body: string): string {
  const line = body
    .split('\n')
    .map((candidate) => candidate.replace(/^[\s#=*-]+|[\s#=*-]+$/g, ''))
    .find(Boolean);
  if (!line) return 'License text';
  return line.length > 72 ? `${line.slice(0, 71).trimEnd()}…` : line;
}

export function numberTexts(notices: ThirdPartyNotices): NoticeText[] {
  const usage = new Map<string, number>();
  for (const pkg of notices.packages) {
    for (const id of pkg.textIds) usage.set(id, (usage.get(id) ?? 0) + 1);
  }
  return Object.entries(notices.texts)
    .map(([id, body]) => ({ id, body, title: titleOf(body), usedBy: usage.get(id) ?? 0 }))
    .filter((text) => text.usedBy > 0)
    .sort(
      (a, b) => b.usedBy - a.usedBy || a.title.localeCompare(b.title) || a.id.localeCompare(b.id),
    )
    .map((text, index) => ({ ...text, number: index + 1 }));
}

export function coveredSources(notices: ThirdPartyNotices): NoticeSource[] {
  const present = new Set(notices.packages.flatMap((pkg) => pkg.sources));
  return NOTICE_SOURCE_ORDER.filter((source) => present.has(source));
}

export function summarizeNotices(notices: ThirdPartyNotices): NoticesSummary {
  return {
    products: coveredSources(notices).map((source) => NOTICE_SOURCE_LABEL[source]),
    packageCount: notices.packages.length,
    groups: groupByLicense(notices.packages).map((group) => ({
      license: group.license,
      count: group.packages.length,
    })),
    texts: numberTexts(notices).map(({ number, title, usedBy }) => ({ number, title, usedBy })),
  };
}
