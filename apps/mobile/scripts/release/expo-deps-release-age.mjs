const STABLE_VERSION = /^(\d+)\.(\d+)\.(\d+)$/;
const SUPPORTED_RANGE = /^([~^]?)(\d+\.\d+\.\d+)$/;
const MINUTE_MS = 60_000;

export function parseVersion(version) {
  const match = STABLE_VERSION.exec(String(version).trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

export function parseExpectedRange(range) {
  const match = SUPPORTED_RANGE.exec(String(range).trim());
  if (!match) return null;
  const operator = match[1];
  const minimum = parseVersion(match[2]);
  const sameLine = (version) => {
    if (operator === '') return compareVersions(version, minimum) === 0;
    if (operator === '~') return version[0] === minimum[0] && version[1] === minimum[1];
    if (minimum[0] > 0) return version[0] === minimum[0];
    if (minimum[1] > 0) return version[0] === 0 && version[1] === minimum[1];
    return compareVersions(version, minimum) === 0;
  };
  return {
    minimum,
    sameLine,
    satisfies: (version) => sameLine(version) && compareVersions(version, minimum) >= 0,
  };
}

export function readReleaseAgePolicy(workspaceYaml) {
  const age = /^minimumReleaseAge:\s*(\d+)\s*$/m.exec(workspaceYaml);
  const excluded = new Set();
  const block = /^minimumReleaseAgeExclude:\s*\n((?:[ \t]+-.*\n?)*)/m.exec(workspaceYaml);
  if (block) {
    for (const line of block[1].split('\n')) {
      const entry = /^[ \t]+-\s*['"]?([^'"\s]+)['"]?\s*$/.exec(line);
      if (entry) excluded.add(entry[1]);
    }
  }
  return { minutes: age ? Number(age[1]) : 0, excluded };
}

function outdated(dependency, reason) {
  return {
    status: 'outdated',
    packageName: dependency.packageName,
    actualVersion: dependency.actualVersion,
    expectedVersionOrRange: dependency.expectedVersionOrRange,
    reason,
  };
}

export function classifyMismatch({ dependency, publishedAt, policy, now }) {
  const range = parseExpectedRange(dependency.expectedVersionOrRange);
  const actual = parseVersion(dependency.actualVersion);
  if (!range) {
    return outdated(dependency, `unsupported range ${dependency.expectedVersionOrRange}`);
  }
  if (!actual) return outdated(dependency, `unreadable version ${dependency.actualVersion}`);
  if (policy.minutes <= 0) return outdated(dependency, 'no release-age rule is configured');
  if (!publishedAt) return outdated(dependency, 'publish dates could not be read');

  const cutoff = now - policy.minutes * MINUTE_MS;
  const versions = [];
  for (const [version, publishedIso] of Object.entries(publishedAt)) {
    const parsed = parseVersion(version);
    const publishedMs = Date.parse(publishedIso);
    if (!parsed || Number.isNaN(publishedMs)) continue;
    const installable =
      publishedMs <= cutoff || policy.excluded.has(`${dependency.packageName}@${version}`);
    versions.push({ version, parsed, publishedMs, installable });
  }

  const satisfying = versions.filter((entry) => range.satisfies(entry.parsed));
  if (satisfying.length === 0) {
    return outdated(
      dependency,
      `no published version satisfies ${dependency.expectedVersionOrRange}`,
    );
  }
  const installableNow = satisfying.find((entry) => entry.installable);
  if (installableNow) {
    return outdated(dependency, `${installableNow.version} can be installed now`);
  }

  const newestAllowed = versions
    .filter(
      (entry) =>
        entry.installable &&
        range.sameLine(entry.parsed) &&
        compareVersions(entry.parsed, range.minimum) < 0,
    )
    .sort((left, right) => compareVersions(right.parsed, left.parsed))[0];
  if (newestAllowed && compareVersions(actual, newestAllowed.parsed) < 0) {
    return outdated(dependency, `${newestAllowed.version} can be installed now`);
  }

  const unlocksAt =
    Math.min(...satisfying.map((entry) => entry.publishedMs)) + policy.minutes * MINUTE_MS;
  return {
    status: 'held',
    packageName: dependency.packageName,
    actualVersion: dependency.actualVersion,
    expectedVersionOrRange: dependency.expectedVersionOrRange,
    unlocksAt: new Date(unlocksAt).toISOString(),
  };
}

export function classifyMismatches({ dependencies, publishedAtByPackage, policy, now }) {
  const results = dependencies.map((dependency) =>
    classifyMismatch({
      dependency,
      publishedAt: publishedAtByPackage[dependency.packageName],
      policy,
      now,
    }),
  );
  return {
    held: results.filter((result) => result.status === 'held'),
    outdated: results.filter((result) => result.status === 'outdated'),
  };
}

export function parseCheckOutput(stdout) {
  const start = stdout.search(/^\{/m);
  if (start < 0) return null;
  try {
    const parsed = JSON.parse(stdout.slice(start));
    if (typeof parsed?.upToDate !== 'boolean' || !Array.isArray(parsed.dependencies)) return null;
    return parsed;
  } catch {
    return null;
  }
}
