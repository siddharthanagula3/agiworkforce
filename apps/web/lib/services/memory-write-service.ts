import 'server-only';

import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import {
  loadMemoryExclusions,
  matchedMemoryExclusion,
  type ManagedMemoryContextDb,
} from './managed-memory-context-service';

export interface RejectedMemoryWrite<T> {
  candidate: T;
  term: string;
}

export interface MemoryWritePartition<T> {
  allowed: T[];
  rejected: Array<RejectedMemoryWrite<T>>;
}

export function excludedMemoryMessage(term: string): string {
  return `Not saved. This memory contains "${term}", which you asked AGI never to remember.`;
}

async function readExclusions(db: ManagedMemoryContextDb, userId: string): Promise<string[]> {
  try {
    return await loadMemoryExclusions(db, { userId });
  } catch (error) {
    logger.error({ error, userId }, 'Memory exclusion read failed; refusing the write');
    throw createError.internal('Could not read your never remember list, so nothing was saved.');
  }
}

export async function assertMemoryWriteAllowed(
  db: ManagedMemoryContextDb,
  params: { userId: string; content: string },
): Promise<void> {
  const term = matchedMemoryExclusion(params.content, await readExclusions(db, params.userId));
  if (term === null) return;
  throw createError.validation(excludedMemoryMessage(term), { excludedTerm: term });
}

export async function partitionMemoryWrites<T>(
  db: ManagedMemoryContextDb,
  params: {
    userId: string;
    candidates: readonly T[];
    contentOf: (candidate: T) => string;
  },
): Promise<MemoryWritePartition<T>> {
  const allowed: T[] = [];
  const rejected: Array<RejectedMemoryWrite<T>> = [];
  if (params.candidates.length === 0) return { allowed, rejected };

  const exclusions = await readExclusions(db, params.userId);
  for (const candidate of params.candidates) {
    const term = matchedMemoryExclusion(params.contentOf(candidate), exclusions);
    if (term === null) allowed.push(candidate);
    else rejected.push({ candidate, term });
  }
  return { allowed, rejected };
}
