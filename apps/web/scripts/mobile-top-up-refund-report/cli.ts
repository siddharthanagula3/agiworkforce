import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  ReportRefusal,
  formatTopUpRefundTable,
  readOverRevokedTopUpRefunds,
  type TopUpRefundReport,
} from './report';

const USAGE = [
  'Usage: pnpm report:mobile-top-up-refunds [--json] [--include-sandbox]',
  '  Lists mobile top-up refunds that took back more credit than the top-up granted,',
  '  and what each account is owed. Reads only; it changes nothing.',
  '  --json             print the report as JSON instead of a table',
  '  --include-sandbox  also list App Store and Play sandbox (tester) receipts',
].join('\n');

const QUIET_LOG_LEVEL = 'error';

export type Print = (line: string) => void;

export interface ReportArgs {
  json: boolean;
  includeSandbox: boolean;
}

export function parseReportArgs(argv: readonly string[]): ReportArgs | null {
  const args: ReportArgs = { json: false, includeSandbox: false };
  for (const flag of argv) {
    if (flag === '--json') args.json = true;
    else if (flag === '--include-sandbox') args.includeSandbox = true;
    else return null;
  }
  return args;
}

export function databaseLabel(connectionString: string | undefined): string {
  if (!connectionString) return 'no database configured';
  try {
    const url = new URL(connectionString);
    return `${url.hostname}${url.pathname}`;
  } catch {
    return 'an unparseable connection string';
  }
}

export async function runTopUpRefundReport(
  argv: readonly string[],
  env: Record<string, string | undefined>,
  openDatabase: () => Promise<DatabaseAdapter>,
  print: Print,
  printError: Print,
  now: () => Date = () => new Date(),
): Promise<number> {
  const args = parseReportArgs(argv);
  if (!args) {
    printError(USAGE);
    return 2;
  }
  printError(
    `Reading ${databaseLabel(env['AGI_DATABASE_URL'] ?? env['DATABASE_URL'])} in a read-only transaction.`,
  );
  const db = await openDatabase();
  let report: TopUpRefundReport;
  try {
    report = await readOverRevokedTopUpRefunds(db, {
      includeSandbox: args.includeSandbox,
      now: now(),
    });
  } catch (error) {
    if (error instanceof ReportRefusal) {
      printError(`Refused: ${error.message}`);
      return 1;
    }
    throw error;
  } finally {
    await db.dispose();
  }
  print(args.json ? JSON.stringify(report, null, 2) : formatTopUpRefundTable(report));
  return 0;
}

async function main(): Promise<void> {
  process.env['LOG_LEVEL'] ??= QUIET_LOG_LEVEL;
  try {
    process.exitCode = await runTopUpRefundReport(
      process.argv.slice(2),
      process.env,
      async () => (await import('@/lib/server/neon-db')).getNeonDb(),
      (line) => process.stdout.write(`${line}\n`),
      (line) => process.stderr.write(`${line}\n`),
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 1;
  }
  await new Promise<void>((done) => process.stdout.write('', () => done()));
  await new Promise<void>((done) => process.stderr.write('', () => done()));
  process.exit();
}

if (require.main === module) void main();
