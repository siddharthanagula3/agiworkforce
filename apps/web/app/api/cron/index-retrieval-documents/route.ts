import 'server-only';

import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { verifyCronRequest } from '@/lib/server/cron-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { reserveDueRetrievalDocuments } from '@/lib/services/retrieval-index-service';
import { dispatchRetrievalIndexWorkflows } from '@/lib/workflows/start-retrieval-index-workflow';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    logger.warn('Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const due = await reserveDueRetrievalDocuments(getNeonDb());
    const report = await dispatchRetrievalIndexWorkflows(
      due.map((document) => ({
        documentId: document.id,
        userId: document.user_id,
        organizationId: document.organization_id,
      })),
    );
    return NextResponse.json({ due: due.length, ...report });
  } catch (error) {
    logger.error({ error }, 'Retrieval index sweep failed');
    return NextResponse.json({ error: 'Retrieval index sweep failed' }, { status: 500 });
  }
}
