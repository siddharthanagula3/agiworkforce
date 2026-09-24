import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  formatManagedMemorySystemPrompt,
  type ManagedMemoryContextItem,
} from '@/lib/services/managed-memory-context-service';
import { loadSuite } from '../score.mts';

const suiteDir = fileURLToPath(new URL('.', import.meta.url));
const { cases, labels } = loadSuite(suiteDir);

interface MemoryRow {
  id: string;
  content: string;
  category: string;
  pinned: boolean;
  updatedAt: string;
}

const sets = (
  JSON.parse(readFileSync(resolve(suiteDir, 'memory-sets.json'), 'utf8')) as {
    sets: Record<string, { memories: MemoryRow[] }>;
  }
).sets;

/** `order by pinned desc, updated_at desc limit 30`, the production query at line 733. */
const MAX_MEMORIES = 30;
function productionOrder(setId: string): MemoryRow[] {
  const rows = [...(sets[setId]?.memories ?? [])];
  rows.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
  return rows.slice(0, MAX_MEMORIES);
}

const standingBySet = (labels as unknown as { standingInstructionsBySet: Record<string, string[]> })
  .standingInstructionsBySet;

interface Row {
  id: string;
  split: string;
  tags: string[];
  setId: string;
  setSize: number;
  included: number;
  neededTotal: number;
  neededIncluded: number;
  neededDropped: string[];
  irrelevantIncluded: number;
  ambiguousIncluded: number;
  promptChars: number;
}

const rows: Row[] = cases.cases.map((one) => {
  const input = one.input as { message: string; memorySetId: string };
  const ordered = productionOrder(input.memorySetId);
  const author = labels.labels[one.id]! as unknown as {
    label: { relevant: string[] };
    ambiguous?: Record<string, string[]>;
  };
  const needed = new Set([...(standingBySet[input.memorySetId] ?? []), ...author.label.relevant]);
  const ambiguous = new Set(Object.keys(author.ambiguous ?? {}));
  for (const id of ambiguous) needed.delete(id);
  const includedIds = new Set(ordered.map((row) => row.id));
  const items: ManagedMemoryContextItem[] = ordered.map((row) => ({
    content: row.content,
    category: row.category,
    pinned: row.pinned,
  }));
  const prompt = formatManagedMemorySystemPrompt(items) ?? '';
  const allIds = new Set((sets[input.memorySetId]?.memories ?? []).map((row) => row.id));
  return {
    id: one.id,
    split: String(one.meta.split),
    tags: one.meta.tags,
    setId: input.memorySetId,
    setSize: allIds.size,
    included: includedIds.size,
    neededTotal: needed.size,
    neededIncluded: [...needed].filter((memoryId) => includedIds.has(memoryId)).length,
    neededDropped: [...needed].filter((memoryId) => !includedIds.has(memoryId)),
    irrelevantIncluded: [...includedIds].filter(
      (memoryId) => !needed.has(memoryId) && !ambiguous.has(memoryId),
    ).length,
    ambiguousIncluded: [...includedIds].filter((memoryId) => ambiguous.has(memoryId)).length,
    promptChars: prompt.length,
  };
});

function aggregate(subset: readonly Row[]): Record<string, number | null> {
  if (subset.length === 0) return { cases: 0, recall: null, precision: null };
  const needed = subset.reduce((sum, row) => sum + row.neededTotal, 0);
  const kept = subset.reduce((sum, row) => sum + row.neededIncluded, 0);
  const included = subset.reduce((sum, row) => sum + row.included, 0);
  const waste = subset.reduce((sum, row) => sum + row.irrelevantIncluded, 0);
  return {
    cases: subset.length,
    recallOfNeeded: Number((kept / needed).toFixed(4)),
    precision: Number((kept / included).toFixed(4)),
    meanRowsSent: Number((included / subset.length).toFixed(2)),
    meanNeededRows: Number((needed / subset.length).toFixed(2)),
    meanIrrelevantRowsSent: Number((waste / subset.length).toFixed(2)),
    meanPromptChars: Number(
      (subset.reduce((sum, row) => sum + row.promptChars, 0) / subset.length).toFixed(1),
    ),
  };
}

const tags = [...new Set(rows.flatMap((row) => row.tags))].sort();
const output = {
  suite: cases.suite,
  generatedAt: new Date().toISOString(),
  baseline: {
    ordering:
      'pinned desc, updated_at desc, limit 30, reproduced from the SQL at managed-memory-context-service.ts:733 because the query needs a database',
    formatting:
      'formatManagedMemorySystemPrompt, the real function, imported and called on the ordered rows',
    behaviour:
      'Production applies no relevance filter at all: every memory in the set is sent on every turn, so recall is 1 by construction and precision is the number that matters.',
  },
  summary: {
    all: aggregate(rows),
    calibration: aggregate(rows.filter((row) => row.split === 'calibration')),
    heldout: aggregate(rows.filter((row) => row.split === 'heldout')),
    byTag: Object.fromEntries(
      tags.map((tag) => [tag, aggregate(rows.filter((row) => row.tags.includes(tag)))]),
    ),
    bySet: Object.fromEntries(
      [...new Set(rows.map((row) => row.setId))].map((setId) => [
        setId,
        aggregate(rows.filter((row) => row.setId === setId)),
      ]),
    ),
    ambiguousMemoryPlacements: rows.reduce((sum, row) => sum + row.ambiguousIncluded, 0),
  },
  rows,
};

writeFileSync(resolve(suiteDir, 'baseline.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ suite: output.suite, summary: output.summary }, null, 2));
