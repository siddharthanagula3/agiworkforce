import 'server-only';

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { USER_SCOPED_TABLES } from '@/lib/server/account-erasure';

const RLS_CLIENTS = /getUserScopedDb|getRlsCapableDb/;
const OWNER_CLIENTS = /getNeonDb|getStripeWebhookDb/;
const TEST_DIRECTORY = '__tests__';
const ROUTE_FILE = 'route.ts';

export const ERASED_TABLE_COUNT = USER_SCOPED_TABLES.length;

export interface RouteIsolationCounts {
  rlsScoped: number;
  ownerConnection: number;
  noDatabase: number;
  databaseBacked: number;
}

function routeFiles(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== TEST_DIRECTORY) routeFiles(full, found);
    } else if (entry === ROUTE_FILE) {
      found.push(full);
    }
  }
  return found;
}

export function measureRouteIsolation(
  apiRoot: string = join(process.cwd(), 'app', 'api'),
): RouteIsolationCounts {
  let rlsScoped = 0;
  let ownerConnection = 0;
  let noDatabase = 0;
  for (const file of routeFiles(apiRoot)) {
    const source = readFileSync(file, 'utf8');
    if (OWNER_CLIENTS.test(source)) ownerConnection += 1;
    else if (RLS_CLIENTS.test(source)) rlsScoped += 1;
    else noDatabase += 1;
  }
  return { rlsScoped, ownerConnection, noDatabase, databaseBacked: rlsScoped + ownerConnection };
}
