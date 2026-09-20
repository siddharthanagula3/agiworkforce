import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_TOOL_SCHEMA_BUDGET,
  selectToolSchemas,
  toolSchemaBytes,
} from '@/app/api/llm/v1/chat/completions/lib/tool-schema-loader';
import type { WebMcpToolDef } from '@/lib/mcp-tool-executor';
import { loadSuite } from '../score.mts';

const suiteDir = fileURLToPath(new URL('.', import.meta.url));
const { cases, labels } = loadSuite(suiteDir);

const catalog = (
  JSON.parse(readFileSync(resolve(suiteDir, 'catalog.json'), 'utf8')) as { tools: WebMcpToolDef[] }
).tools;
const catalogBytes = catalog.reduce((sum, tool) => sum + toolSchemaBytes(tool), 0);

interface Row {
  id: string;
  split: string;
  tags: string[];
  needed: string[];
  shortlist: string[];
  missed: string[];
  deferred: number;
  selectedBytes: number;
  scored: boolean;
  defensible: boolean;
}

const rows: Row[] = cases.cases.map((one) => {
  const message = (one.input as { message: string }).message;
  const selected = selectToolSchemas({ tools: catalog, turnText: message });
  const shortlist = selected.tools.map((tool) => tool.qualifiedName);
  const author = labels.labels[one.id]! as unknown as {
    label: string[] | 'ambiguous';
    alternatives?: string[][];
  };
  const ambiguous = author.label === 'ambiguous';
  const needed = ambiguous ? (author.alternatives?.[0] ?? []) : (author.label as string[]);
  const covers = (want: readonly string[]) => want.every((name) => shortlist.includes(name));
  return {
    id: one.id,
    split: String(one.meta.split),
    tags: one.meta.tags,
    needed,
    shortlist,
    missed: needed.filter((name) => !shortlist.includes(name)),
    deferred: selected.deferred.length,
    selectedBytes: selected.bytes,
    scored: !ambiguous,
    defensible: ambiguous && (author.alternatives ?? []).some(covers),
  };
});

function aggregate(subset: readonly Row[]): Record<string, number | null> {
  const scored = subset.filter((row) => row.scored);
  if (scored.length === 0) return { cases: subset.length, scored: 0 };
  const neededTotal = scored.reduce((sum, row) => sum + row.needed.length, 0);
  const found = neededTotal - scored.reduce((sum, row) => sum + row.missed.length, 0);
  const withNeed = scored.filter((row) => row.needed.length > 0);
  return {
    cases: subset.length,
    scored: scored.length,
    toolRecall: neededTotal ? Number((found / neededTotal).toFixed(4)) : null,
    casesFullyCovered: withNeed.filter((row) => row.missed.length === 0).length,
    casesWithANeed: withNeed.length,
    meanShortlistSize: Number(
      (scored.reduce((sum, row) => sum + row.shortlist.length, 0) / scored.length).toFixed(2),
    ),
    meanNeeded: Number((neededTotal / scored.length).toFixed(2)),
    meanSelectedBytes: Number(
      (scored.reduce((sum, row) => sum + row.selectedBytes, 0) / scored.length).toFixed(1),
    ),
  };
}

const tags = [...new Set(rows.flatMap((row) => row.tags))].sort();
const emptyLabelled = rows.filter((row) => row.scored && row.needed.length === 0);
const output = {
  suite: cases.suite,
  generatedAt: new Date().toISOString(),
  baseline: {
    function: 'selectToolSchemas',
    source: 'apps/web/app/api/llm/v1/chat/completions/lib/tool-schema-loader.ts:95, imported and called',
    budget: DEFAULT_TOOL_SCHEMA_BUDGET,
    catalog: { tools: catalog.length, totalSchemaBytes: catalogBytes },
    note: 'Ambiguous cases score their first listed alternative for recall and are excluded from the totals; the ambiguous block reports whether the shortlist covered either reading.',
  },
  summary: {
    all: aggregate(rows),
    calibration: aggregate(rows.filter((row) => row.split === 'calibration')),
    heldout: aggregate(rows.filter((row) => row.split === 'heldout')),
    byTag: Object.fromEntries(
      tags.map((tag) => [tag, aggregate(rows.filter((row) => row.tags.includes(tag)))]),
    ),
    noToolNeededCases: {
      cases: emptyLabelled.length,
      meanShortlistSize: Number(
        (emptyLabelled.reduce((sum, row) => sum + row.shortlist.length, 0) /
          Math.max(1, emptyLabelled.length)).toFixed(2),
      ),
      meanSelectedBytes: Number(
        (emptyLabelled.reduce((sum, row) => sum + row.selectedBytes, 0) /
          Math.max(1, emptyLabelled.length)).toFixed(1),
      ),
    },
    ambiguous: {
      cases: rows.filter((row) => !row.scored).length,
      coveredADefensibleReading: rows.filter((row) => row.defensible).length,
    },
  },
  rows,
};

writeFileSync(resolve(suiteDir, 'baseline.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ suite: output.suite, summary: output.summary }, null, 2));
