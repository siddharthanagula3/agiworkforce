import process from 'node:process';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { createDatabaseClient, DataLayerConfigError } from '@agiworkforce/data-layer';
import { assertMutationTarget, migrationConnectionString } from '../../../scripts/neon-migrate.mjs';
import { MigrationContractError } from '../../../scripts/lib/neon-migrations.mjs';
import {
  KnowledgeKeyNormalizationRefused,
  normalizeProjectKnowledgeKeys,
} from './lib/project-knowledge-key-normalization.ts';

export function normalizationOptions(args, env) {
  const { values, positionals } = parseArgs({
    args: args.filter((value) => value !== '--'),
    allowPositionals: true,
    options: {
      review: { type: 'string' },
      target: { type: 'string' },
      'confirm-production': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  const mode = positionals[0] ?? 'report';
  if (positionals.length > 1 || !['report', 'apply'].includes(mode)) {
    throw new KnowledgeKeyNormalizationRefused('Expected report or apply.');
  }
  if (!values.help && mode === 'apply' && !/^[a-f0-9]{64}$/.test(values.review ?? '')) {
    throw new KnowledgeKeyNormalizationRefused(
      'Apply requires --review with the exact inventory digest.',
    );
  }
  if (mode === 'report' && values.review !== undefined) {
    throw new KnowledgeKeyNormalizationRefused('--review is accepted only with apply.');
  }
  const connectionString = values.help
    ? undefined
    : migrationConnectionString(env, mode === 'apply' ? 'apply' : 'status');
  if (!values.help && !connectionString) {
    throw new KnowledgeKeyNormalizationRefused('Export the migration database connection.');
  }
  const options = {
    target: values.target ?? env.AGI_MIGRATION_TARGET,
    confirmProduction: values['confirm-production'],
  };
  if (mode === 'apply' && !values.help) assertMutationTarget(options, connectionString);
  return { ...options, connectionString, mode, review: values.review, help: values.help };
}

export async function main(args = process.argv.slice(2), env = process.env) {
  let db;
  let status = 1;
  try {
    const options = normalizationOptions(args, env);
    if (options.help) {
      process.stdout.write(
        'Usage: normalize:knowledge-keys [report | apply --review DIGEST --target TARGET [--confirm-production]]\n' +
          'Report is read-only. Apply rewrites reviewed URL references to canonical keys and briefly blocks project/source writes. It does not delete objects or install migrations.\n' +
          'The shared database environment-isolation policy also applies; a target flag does not override it.\n',
      );
      return 0;
    }
    db = createDatabaseClient({
      connectionString: options.connectionString,
      poolSize: 1,
      applicationName: 'agi-project-key-normalization',
    });
    const report = await normalizeProjectKnowledgeKeys(db, {
      ...(options.mode === 'apply' ? { review: options.review } : {}),
    });
    process.stdout.write(`${JSON.stringify({ target: options.target ?? null, ...report })}\n`);
    status = report.ready ? 0 : 2;
  } catch (error) {
    let message =
      'Normalization failed; check the command arguments and database/storage configuration.';
    if (
      error instanceof KnowledgeKeyNormalizationRefused ||
      error instanceof MigrationContractError
    ) {
      message = error.message;
    } else if (error instanceof DataLayerConfigError) {
      message =
        'Database initialization refused this environment or configuration. Use the configured migration environment and shared database-isolation policy.';
    }
    process.stderr.write(`${message}\n`);
  } finally {
    try {
      await db?.dispose();
    } catch {
      process.stderr.write('The normalization database client did not close cleanly.\n');
      status = 1;
    }
  }
  return status;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
