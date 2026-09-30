import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from 'next/constants';

const RLS_CLIENTS = /getUserScopedDb|getRlsCapableDb/;
const OWNER_CLIENTS = /getNeonDb|getStripeWebhookDb/;
const TEST_DIRECTORY = '__tests__';
const ROUTE_FILE = 'route.ts';

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

export function measureRouteIsolation(apiRoot: string): RouteIsolationCounts {
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

export function writeRouteIsolationCounts(phase: string, webRoot: string): void {
  if (phase !== PHASE_DEVELOPMENT_SERVER && phase !== PHASE_PRODUCTION_BUILD) return;
  const output = join(webRoot, 'lib', 'legal', 'route-isolation.generated.json');
  const counts = measureRouteIsolation(join(webRoot, 'app', 'api'));
  writeFileSync(output, `${JSON.stringify(counts, null, 2)}\n`);
}
