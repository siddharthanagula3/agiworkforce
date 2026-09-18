/**
 * The release-channel half of the rollout ring, for the pipelines that cannot
 * import the web module. `channels.test.mjs` reads the channel list back out of
 * apps/web/lib/feature-flags/rollout-rings.ts, so the two cannot drift.
 */
export const RELEASE_CHANNELS = ['stable', 'beta', 'nightly'];

const NIGHTLY_LABELS = new Set(['alpha', 'nightly', 'canary', 'dev']);

const TAG_PREFIXES = {
  cli: 'v-cli-',
  vscode: 'v-vscode-',
  chrome: 'v-chrome-',
  desktop: 'v-desktop-',
};

export function surfaceTagPrefix(surface) {
  const prefix = TAG_PREFIXES[surface];
  if (prefix === undefined) throw new Error(`no release tag prefix is defined for ${surface}`);
  return prefix;
}

export function versionForTag(surface, tag) {
  const prefix = surfaceTagPrefix(surface);
  if (!tag.startsWith(prefix)) {
    throw new Error(`${surface} release tags start with ${prefix}, got ${tag}`);
  }
  return tag.slice(prefix.length);
}

/**
 * The channel a version names. A bare X.Y.Z is stable; a prerelease label picks
 * the channel it belongs to, so a tag cannot land on a channel by accident and
 * a stable installer can never be served from a nightly build.
 */
export function channelForVersion(version) {
  const withoutBuild = version.split('+')[0];
  const separator = withoutBuild.indexOf('-');
  if (separator === -1) {
    if (!/^\d+\.\d+\.\d+$/.test(withoutBuild)) {
      throw new Error(`version ${version} is not X.Y.Z or X.Y.Z-<label>.<n>`);
    }
    return 'stable';
  }
  const core = withoutBuild.slice(0, separator);
  if (!/^\d+\.\d+\.\d+$/.test(core)) {
    throw new Error(`version ${version} is not X.Y.Z or X.Y.Z-<label>.<n>`);
  }
  const label = withoutBuild
    .slice(separator + 1)
    .split('.')[0]
    .toLowerCase();
  if (NIGHTLY_LABELS.has(label)) return 'nightly';
  if (label === 'beta' || label === 'rc' || label === 'next') return 'beta';
  throw new Error(
    `version ${version} carries prerelease label "${label}", which names no release channel`,
  );
}

export function channelForTag(surface, tag) {
  return channelForVersion(versionForTag(surface, tag));
}

/**
 * The X.Y.Z a prerelease build still declares. The Marketplace and the desktop
 * bundle both reject a semver prerelease identifier in the manifest version,
 * so the channel lives in the tag while the manifest stays plain.
 */
export function coreVersion(version) {
  return version.split('+')[0].split('-')[0];
}

/**
 * npm serves a channel as a dist-tag, and `latest` is what a bare install gets.
 * scripts/publish-cli.sh derives the same two tags from the version itself and
 * refuses a contradicting NPM_DIST_TAG, so these must agree.
 */
export function npmDistTag(channel) {
  return channel === 'stable' ? 'latest' : 'next';
}

/**
 * The Marketplace has two channels, not three: everything that is not stable is
 * published pre-release, so a beta or nightly build can never become the
 * version a plain install picks up.
 */
export function vsceChannelArgs(channel) {
  return channel === 'stable' ? [] : ['--pre-release'];
}

export function isPrerelease(channel) {
  return channel !== 'stable';
}

/**
 * A store keeps one version sequence for both channels, so the same X.Y.Z can
 * never be published twice. Every other tag for this surface is the evidence:
 * if one of them already claims this core version on another channel, the
 * second publish would be rejected by the store rather than by us.
 */
export function channelVersionCollisions(surface, tag, existingTags) {
  const channel = channelForTag(surface, tag);
  const core = coreVersion(versionForTag(surface, tag));
  const collisions = [];
  for (const other of existingTags) {
    if (other === tag || !other.startsWith(surfaceTagPrefix(surface))) continue;
    const otherVersion = versionForTag(surface, other);
    if (coreVersion(otherVersion) !== core) continue;
    const otherChannel = channelForVersion(otherVersion);
    if (otherChannel === channel) continue;
    collisions.push(
      `${tag} publishes ${core} to ${channel}, but ${other} already claims it on ${otherChannel}`,
    );
  }
  return collisions;
}
