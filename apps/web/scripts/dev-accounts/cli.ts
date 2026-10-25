import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { loadLocalEnvFile } from '../../e2e/lib/env-file';
import {
  DevAccountsRefusal,
  assertLocalTestEnvironment,
  type LocalTestEnvironment,
} from './environment';

export type Print = (line: string) => void;

export interface DevAccountCommands {
  seed: (environment: LocalTestEnvironment, selector: string, print: Print) => Promise<void>;
  reset: (environment: LocalTestEnvironment, selector: string, print: Print) => Promise<void>;
  list: (environment: LocalTestEnvironment, print: Print) => Promise<void>;
}

const USAGE = [
  'Usage: pnpm dev:accounts <command>',
  '  seed [name|all]    make the test accounts that do not exist yet (default: all)',
  '  reset <name|all>   put accounts back to their seeded plan, usage, credits and settings',
  '  list               show each account, its plan, its live state and how to sign in as it',
].join('\n');

const LOCAL_ENV_FILE = '.env.local';
const QUIET_LOG_LEVEL = 'error';

/**
 * The environment check runs first and the commands are loaded only once it
 * passes, so a refused run never opens a database pool or calls Clerk or
 * Stripe.
 */
export async function runDevAccounts(
  argv: readonly string[],
  env: Record<string, string | undefined>,
  loadCommands: () => Promise<DevAccountCommands>,
  print: Print,
  printError: Print,
): Promise<number> {
  const [command, selector] = argv;
  if (command !== 'seed' && command !== 'reset' && command !== 'list') {
    printError(USAGE);
    return 2;
  }
  if (command === 'reset' && !selector) {
    printError('Name the account to reset, or "all".');
    printError(USAGE);
    return 2;
  }

  let environment: LocalTestEnvironment;
  try {
    environment = assertLocalTestEnvironment(env);
  } catch (error) {
    if (error instanceof DevAccountsRefusal) {
      printError(`Refused (${error.code}): ${error.message}`);
      return 1;
    }
    throw error;
  }

  const commands = await loadCommands();
  if (command === 'seed') await commands.seed(environment, selector ?? 'all', print);
  if (command === 'reset') await commands.reset(environment, selector as string, print);
  if (command === 'list') await commands.list(environment, print);
  return 0;
}

/**
 * tsx runs the CLI as CommonJS, while Next compiles the same server graph with
 * its bundler. Two gaps follow. Next aliases `next/navigation` to its server
 * build under the react-server condition, and without that alias a server
 * import such as `@clerk/nextjs/server` loads the client module, which needs
 * React APIs the react-server build lacks. And a package that publishes only
 * an `import` export (the MCP task extension) has no entry `require` can match,
 * so it is resolved through that export and loaded with Node's require(esm).
 */
function resolveServerGraphLikeNext(): void {
  registerHooks({
    resolve: (specifier, context, nextResolve) => {
      const target =
        specifier === 'next/navigation'
          ? 'next/dist/client/components/navigation.react-server'
          : specifier;
      try {
        return nextResolve(target, context);
      } catch (error) {
        if ((error as { code?: unknown }).code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error;
        return nextResolve(target, {
          ...context,
          conditions: [...context.conditions, 'import'],
        });
      }
    },
  });
}

async function main(): Promise<void> {
  resolveServerGraphLikeNext();
  loadLocalEnvFile(resolve(__dirname, '..', '..', LOCAL_ENV_FILE));
  process.env['LOG_LEVEL'] ??= QUIET_LOG_LEVEL;
  try {
    process.exitCode = await runDevAccounts(
      process.argv.slice(2),
      process.env,
      () => import('./commands'),
      (line) => process.stdout.write(`${line}\n`),
      (line) => process.stderr.write(`${line}\n`),
    );
  } catch (error) {
    if (error instanceof DevAccountsRefusal) {
      process.stderr.write(`Refused (${error.code}): ${error.message}\n`);
    } else {
      process.stderr.write(
        `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
      );
    }
    process.exitCode = 1;
  }
  // The Stripe SDK's keep-alive sockets and the product's background timers
  // would otherwise hold a finished run open indefinitely. Output to a pipe is
  // asynchronous, so it is flushed before the exit.
  await new Promise<void>((done) => process.stdout.write('', () => done()));
  await new Promise<void>((done) => process.stderr.write('', () => done()));
  process.exit();
}

if (require.main === module) void main();
