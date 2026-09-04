import { OSS_LICENSES_GENERATED_AT, OSS_LICENSE_BODIES, OSS_PACKAGES } from './licenses.generated';
import type { OssLicenseAttribution, OssLicenseGroup } from './types';

export { OSS_LICENSES_GENERATED_AT, OSS_LICENSE_BODIES, OSS_PACKAGES };
export type { OssLicenseAttribution, OssLicenseGroup };

/**
 * Groups packages by the license text they ship, so each body is rendered
 * once with every package that carries it. Packages with no bundled license
 * file are grouped by their declared SPDX id instead, they still have to be
 * listed, and the screen says plainly that no text was bundled.
 */
export function groupOssPackages(
  packages: OssLicenseAttribution[] = OSS_PACKAGES,
  bodies: Record<string, string> = OSS_LICENSE_BODIES,
): OssLicenseGroup[] {
  const groups = new Map<string, OssLicenseGroup>();

  for (const entry of packages) {
    const key = entry.bodyId ?? `declared:${entry.license}`;
    const existing = groups.get(key);
    if (existing) {
      existing.packages.push(entry);
      if (!existing.licenses.includes(entry.license)) existing.licenses.push(entry.license);
      continue;
    }
    groups.set(key, {
      bodyId: entry.bodyId,
      licenses: [entry.license],
      packages: [entry],
      body: entry.bodyId ? (bodies[entry.bodyId] ?? null) : null,
    });
  }

  const result = [...groups.values()];
  for (const group of result) {
    group.licenses.sort((a, b) => a.localeCompare(b));
    group.packages.sort((a, b) => a.name.localeCompare(b.name));
  }
  result.sort(
    (a, b) =>
      b.packages.length - a.packages.length ||
      (a.licenses[0] ?? '').localeCompare(b.licenses[0] ?? ''),
  );
  return result;
}
