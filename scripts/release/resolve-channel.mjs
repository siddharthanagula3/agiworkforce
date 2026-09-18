#!/usr/bin/env node
// Resolves the release channel a tag belongs to and writes it to GITHUB_OUTPUT,
// so one tag cannot be published to two channels by two pipelines.

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import process from 'node:process';

import {
  channelForTag,
  channelVersionCollisions,
  coreVersion,
  isPrerelease,
  npmDistTag,
  surfaceTagPrefix,
  versionForTag,
  vsceChannelArgs,
} from '../lib/rollout/channels.mjs';

function existingTags(surface) {
  try {
    return execFileSync('git', ['tag', '--list', `${surfaceTagPrefix(surface)}*`], {
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

function main() {
  const [surface, tag] = process.argv.slice(2);
  if (!surface || !tag) {
    console.error('usage: resolve-channel.mjs <surface> <tag>');
    process.exit(2);
  }

  const version = versionForTag(surface, tag);
  const channel = channelForTag(surface, tag);
  const collisions = channelVersionCollisions(surface, tag, existingTags(surface));
  if (collisions.length > 0) {
    for (const collision of collisions) console.error(`ERROR: ${collision}`);
    process.exit(1);
  }
  const outputs = {
    channel,
    version,
    core_version: coreVersion(version),
    prerelease: String(isPrerelease(channel)),
    npm_dist_tag: npmDistTag(channel),
    vsce_args: vsceChannelArgs(channel).join(' '),
  };

  const lines = Object.entries(outputs).map(([key, value]) => `${key}=${value}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
  for (const line of lines) console.log(line);
}

main();
