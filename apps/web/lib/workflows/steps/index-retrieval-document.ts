import 'server-only';

import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  indexRetrievalDocument,
  type RetrievalIndexOutcome,
} from '@/lib/services/retrieval-index-service';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface RetrievalIndexWorkflowInput {
  version: 1;
  documentId: string;
  userId: string;
  organizationId: string | null;
}

export function parseRetrievalIndexWorkflowInput(
  value: RetrievalIndexWorkflowInput,
): RetrievalIndexWorkflowInput {
  if (
    value.version !== 1 ||
    !UUID_PATTERN.test(value.documentId) ||
    typeof value.userId !== 'string' ||
    value.userId.trim().length === 0 ||
    value.userId.length > 255 ||
    (value.organizationId !== null && !UUID_PATTERN.test(value.organizationId))
  ) {
    throw new Error('Invalid retrieval index workflow input.');
  }
  return value;
}

export async function indexRetrievalDocumentWorkflowStep(
  rawInput: RetrievalIndexWorkflowInput,
  workflowRunId: string,
): Promise<RetrievalIndexOutcome> {
  'use step';

  const input = parseRetrievalIndexWorkflowInput(rawInput);
  const db = createClaimedUserScopedDb(getNeonDb(), {
    userId: input.userId,
    organizationId: input.organizationId,
  });
  return indexRetrievalDocument(db, input.documentId, workflowRunId);
}
