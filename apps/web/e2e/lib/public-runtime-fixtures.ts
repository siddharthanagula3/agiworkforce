import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import ts from 'typescript';
import { ManagedCloudScheduleShareSnapshotSchema } from '@agiworkforce/cloud-contracts';
import type { DirectoryRecord } from '../../lib/connectors/directory/types';

function literalOwner(file: string, name: string): string {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === name &&
        declaration.initializer &&
        ts.isStringLiteral(declaration.initializer)
      )
        return declaration.initializer.text;
    }
  }
  throw new Error(`The public fixture cannot resolve canonical ${name}`);
}

export function publicRuntimeFixtures(now = Date.now()) {
  const marker = randomBytes(4).toString('hex');
  const cacheSource = path.resolve(__dirname, '../../lib/connectors/directory/snapshot-cache.ts');
  const connector: DirectoryRecord = {
    id: `public-matrix/fixture-${marker}`,
    name: `Public matrix connector ${marker}`,
    publisher: 'Local test fixture',
    description: `A local fixture for checking the public connector page ${marker}.`,
    categories: [],
    remotes: [{ url: 'https://connector.example.invalid/mcp', transport: 'streamable-http' }],
    authMode: 'none',
    connectable: 'connect',
    toolNames: ['fixture_read'],
    repositoryUrl: null,
    version: '1.0.0',
    sourceRegistry: 'internal',
    badge: 'official',
    iconUrl: null,
    monogram: 'PF',
    documentationUrl: null,
    iconSource: 'monogram',
    brandSlug: null,
    authorName: null,
    authorUrl: null,
    websiteUrl: null,
    supportUrl: null,
    privacyPolicyUrl: null,
  };
  const schedule = ManagedCloudScheduleShareSnapshotSchema.parse({
    name: `Public matrix schedule ${marker}`,
    description: `A local schedule preview fixture ${marker}.`,
    prompt: `This is a local public-page fixture ${marker}. Do not execute a task.`,
    model: null,
    scheduleType: 'interval',
    cronExpression: null,
    intervalMs: 86_400_000,
    recurrenceRule: null,
    dayparts: null,
    metadata: {},
    missedExecutionPolicy: 'run_once',
    retryMaxAttempts: 0,
    retryBackoffSeconds: 300,
  });
  return {
    owner: 'public_matrix_fixture_owner',
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 86_400_000).toISOString(),
    session: {
      token: randomBytes(12).toString('hex'),
      title: `Public matrix conversation ${marker}`,
      messages: [
        {
          id: 'fixture-message',
          role: 'assistant',
          content: `Public matrix conversation content ${marker}.`,
        },
      ],
    },
    schedule: { token: randomBytes(12).toString('hex'), snapshot: schedule },
    artifact: {
      token: randomBytes(12).toString('hex'),
      id: 'public-matrix-artifact',
      title: `Public matrix artifact ${marker}`,
      kind: 'markdown',
      content: `Public matrix artifact content ${marker}.`,
    },
    plugin: {
      id: `public-matrix-fixture-${marker}`,
      name: `Public matrix plugin ${marker}`,
      description: `A local preview entry used to measure the public plugin page ${marker}.`,
    },
    connector,
    snapshotKey: {
      method: literalOwner(cacheSource, 'SNAPSHOT_METHOD'),
      params: literalOwner(cacheSource, 'SNAPSHOT_PARAMS'),
    },
    syncKey: {
      method: literalOwner(cacheSource, 'SYNC_STATE_METHOD'),
      params: literalOwner(cacheSource, 'SYNC_STATE_PARAMS'),
    },
  };
}

export type PublicRuntimeFixtures = ReturnType<typeof publicRuntimeFixtures>;
