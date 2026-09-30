import 'server-only';

import { USER_SCOPED_TABLES } from '@/lib/server/account-erasure';
import counts from './route-isolation.generated.json';
import type { RouteIsolationCounts } from './route-isolation-counts';

export const ERASED_TABLE_COUNT = USER_SCOPED_TABLES.length;

export const ROUTE_ISOLATION_COUNTS: RouteIsolationCounts = counts;
