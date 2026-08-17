#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parse } from 'yaml';

const DESKTOP_WORKFLOW = '.github/workflows/release-desktop.yml';
const MOBILE_WORKFLOW = '.github/workflows/release-mobile.yml';

function stepText(step) {
  return [
    step?.name,
    step?.run,
    step?.uses,
    JSON.stringify(step?.with ?? ''),
    JSON.stringify(step?.env ?? ''),
  ]
    .filter(Boolean)
    .join('\n');
}

function jobText(job) {
  return (job?.steps ?? []).map(stepText).join('\n');
}

export function checkDesktopReleaseGates(workflow) {
  const failures = [];
  const jobs = workflow?.jobs ?? {};

  for (const jobId of ['build-linux', 'build-macos']) {
    const job = jobs[jobId];
    if (!job) {
      failures.push(`${jobId} job is missing`);
      continue;
    }
    const body = jobText(job);
    if (!body.includes('scripts/generate-sbom.mjs')) {
      failures.push(`${jobId} must generate an SBOM with scripts/generate-sbom.mjs`);
    }
    if (!/sbom/iu.test(body) || !body.includes('upload-artifact')) {
      failures.push(`${jobId} must upload the generated SBOM as a build artifact`);
    }
  }

  const cleanInstall = jobs['clean-install-linux'];
  if (!cleanInstall) {
    failures.push('clean-install-linux job is missing: no release is installed on a clean machine');
  } else {
    const body = jobText(cleanInstall);
    if (!cleanInstall.container?.image) {
      failures.push(
        'clean-install-linux must run in a bare container image, not a preloaded runner',
      );
    }
    if (!(cleanInstall.needs ?? []).includes('build-linux')) {
      failures.push('clean-install-linux must consume the artifacts built by build-linux');
    }
    if (body.includes('pnpm install')) {
      failures.push(
        'clean-install-linux must not restore the build toolchain; it is a clean-machine test',
      );
    }
    if (!body.includes('download-artifact')) {
      failures.push(
        'clean-install-linux must download the published artifact rather than rebuild it',
      );
    }
    if (!body.includes('dpkg-deb -f') || !/apt-get install|dpkg -i/u.test(body)) {
      failures.push('clean-install-linux must install the Debian package it downloaded');
    }
    if (!body.includes('ldd')) {
      failures.push(
        'clean-install-linux must prove no shared library is missing on a clean machine',
      );
    }
  }

  const upgrade = jobs['upgrade-from-previous-linux'];
  if (!upgrade) {
    failures.push('upgrade-from-previous-linux job is missing: no upgrade path is tested');
  } else {
    const body = jobText(upgrade);
    if (!body.includes('scripts/verify-desktop-upgrade.mjs')) {
      failures.push(
        'upgrade-from-previous-linux must assert data survival with verify-desktop-upgrade.mjs',
      );
    }
    if (!body.includes('--rollback')) {
      failures.push('upgrade-from-previous-linux must also verify the rollback path');
    }
    if (!body.includes('previous_tag')) {
      failures.push(
        'upgrade-from-previous-linux must install the previously published release first',
      );
    }
  }

  const publish = jobs['publish-release'];
  if (publish) {
    for (const gate of ['clean-install-linux', 'upgrade-from-previous-linux']) {
      if (!(publish.needs ?? []).includes(gate)) {
        failures.push(`publish-release must not publish before ${gate} passes`);
      }
    }
  }

  return failures;
}

export function checkMobileReleaseGates(workflow) {
  const failures = [];
  const jobs = workflow?.jobs ?? {};

  const validate = jobs.validate;
  if (!validate) {
    failures.push('validate job is missing');
  } else if (!jobText(validate).includes('release:verify-privacy-declarations')) {
    failures.push(
      'validate must verify the iOS privacy manifest against the Play data-safety declaration',
    );
  }

  const deviceMatrix = jobs['device-matrix-e2e'];
  if (!deviceMatrix) {
    failures.push('device-matrix-e2e job is missing: no release is exercised on a device matrix');
  } else {
    if (!deviceMatrix.strategy?.matrix) {
      failures.push('device-matrix-e2e must declare a strategy matrix of devices');
    }
    if (!jobText(deviceMatrix).includes('test:e2e:ios:ci')) {
      failures.push('device-matrix-e2e must run the mobile end-to-end suite');
    }
  }

  for (const jobId of ['release-ios', 'release-android']) {
    const job = jobs[jobId];
    if (!job) {
      failures.push(`${jobId} job is missing`);
      continue;
    }
    if (!(job.needs ?? []).includes('device-matrix-e2e')) {
      failures.push(`${jobId} must not submit a build the device matrix has not exercised`);
    }
  }

  return failures;
}

function main() {
  const root = process.cwd();
  const failures = [];

  for (const [relativePath, check] of [
    [DESKTOP_WORKFLOW, checkDesktopReleaseGates],
    [MOBILE_WORKFLOW, checkMobileReleaseGates],
  ]) {
    const absolute = path.join(root, relativePath);
    if (!fs.existsSync(absolute)) {
      failures.push(`${relativePath}: missing`);
      continue;
    }
    for (const failure of check(parse(fs.readFileSync(absolute, 'utf8')))) {
      failures.push(`${relativePath}: ${failure}`);
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      process.stderr.write(`ERROR: ${failure}\n`);
    }
    process.stderr.write(`\n${failures.length} release gate(s) missing\n`);
    process.exit(1);
  }
  process.stdout.write(
    'release gates present: SBOM, clean-machine install, upgrade + rollback, device matrix, privacy declarations\n',
  );
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
