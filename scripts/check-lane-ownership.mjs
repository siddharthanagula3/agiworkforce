#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const errors = [];

function readJson(relativePath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
  } catch (error) {
    errors.push(`${relativePath} is not valid JSON: ${error.message}`);
    return null;
  }
}

function existsForPattern(pattern) {
  const base = pattern.includes('/**') ? pattern.slice(0, pattern.indexOf('/**')) : pattern;
  if (base.includes('*')) return true;
  return fs.existsSync(path.join(root, base));
}

function matchesPattern(filePath, pattern) {
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return filePath === prefix || filePath.startsWith(`${prefix}/`);
  }
  return filePath === pattern;
}

function gitLines(args) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    errors.push(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
    return [];
  }
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

const lanesDoc = readJson('docs/agent-context/lanes.json');
const taskSchema = readJson('docs/agent-context/task-manifest.schema.json');

if (!fs.existsSync(path.join(root, 'docs/agent-context/shared-files.md'))) {
  errors.push('Missing docs/agent-context/shared-files.md');
}

if (lanesDoc) {
  const laneIds = new Set();
  const requiredLaneFields = [
    'id',
    'name',
    'ownerRole',
    'ownedWritePaths',
    'readOnlyContextPaths',
    'blockedPaths',
    'requiredChecks',
    'escalationOwners',
  ];

  for (const lane of lanesDoc.lanes ?? []) {
    for (const field of requiredLaneFields) {
      if (!lane[field] || (Array.isArray(lane[field]) && lane[field].length === 0)) {
        errors.push(`lane ${lane.id ?? '<unknown>'} missing ${field}`);
      }
    }
    if (laneIds.has(lane.id)) {
      errors.push(`Duplicate lane id: ${lane.id}`);
    }
    laneIds.add(lane.id);

    for (const pattern of lane.ownedWritePaths ?? []) {
      if (!existsForPattern(pattern)) {
        errors.push(`lane ${lane.id} ownedWritePath does not exist: ${pattern}`);
      }
    }
  }

  for (const integrationLaneId of lanesDoc.sharedFilePolicy?.integrationLaneIds ?? []) {
    if (!laneIds.has(integrationLaneId)) {
      errors.push(`sharedFilePolicy integration lane does not exist: ${integrationLaneId}`);
    }
  }

  if (
    !lanesDoc.recommendedParallelism?.writerLanes ||
    lanesDoc.recommendedParallelism.writerLanes < 15
  ) {
    errors.push('lanes.json must document at least 15 writer lanes.');
  }

  const laneArgIndex = process.argv.indexOf('--lane');
  const laneId =
    process.env.AGI_LANE_ID || (laneArgIndex >= 0 ? process.argv[laneArgIndex + 1] : null);

  if (laneId) {
    const lane = (lanesDoc.lanes ?? []).find((candidate) => candidate.id === laneId);
    if (!lane) {
      errors.push(`Unknown lane id: ${laneId}`);
    } else {
      const useStaged = process.argv.includes('--staged');
      const baseArgIndex = process.argv.indexOf('--base');
      const changedFiles =
        baseArgIndex >= 0
          ? gitLines(['diff', '--name-only', process.argv[baseArgIndex + 1], '--'])
          : useStaged
            ? gitLines(['diff', '--cached', '--name-only', '--'])
            : gitLines(['diff', '--name-only', '--']);

      const sharedPatterns = lanesDoc.sharedFilePolicy?.paths ?? [];
      const integrationLaneIds = new Set(lanesDoc.sharedFilePolicy?.integrationLaneIds ?? []);

      for (const changedFile of changedFiles) {
        const owned = (lane.ownedWritePaths ?? []).some((pattern) =>
          matchesPattern(changedFile, pattern),
        );
        const shared = sharedPatterns.some((pattern) => matchesPattern(changedFile, pattern));
        if (!owned) {
          errors.push(`lane ${laneId} changed unowned path: ${changedFile}`);
        }
        if (shared && !integrationLaneIds.has(laneId)) {
          errors.push(
            `lane ${laneId} changed shared path without integration ownership: ${changedFile}`,
          );
        }
      }
    }
  }
}

if (taskSchema) {
  for (const field of [
    'taskId',
    'laneId',
    'goal',
    'ownedWritePaths',
    'requiredChecks',
    'riskLevel',
  ]) {
    if (!taskSchema.required?.includes(field)) {
      errors.push(`task-manifest schema must require ${field}`);
    }
  }
}

if (errors.length > 0) {
  console.error('Lane ownership check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Lane ownership check passed.');
