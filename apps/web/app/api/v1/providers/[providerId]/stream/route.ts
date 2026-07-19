import 'server-only';

import { retiredManagedExecutionResponse } from '@/lib/server/retired-managed-execution';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function POST() {
  return retiredManagedExecutionResponse();
}
