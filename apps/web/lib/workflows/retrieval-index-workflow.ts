import 'server-only';

import { getWorkflowMetadata } from 'workflow';

import {
  indexRetrievalDocumentWorkflowStep,
  type RetrievalIndexWorkflowInput,
} from './steps/index-retrieval-document';

export type { RetrievalIndexWorkflowInput } from './steps/index-retrieval-document';

export async function retrievalIndexWorkflow(input: RetrievalIndexWorkflowInput): Promise<void> {
  'use workflow';

  await indexRetrievalDocumentWorkflowStep(input, getWorkflowMetadata().workflowRunId);
}
