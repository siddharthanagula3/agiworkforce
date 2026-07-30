import { createHash } from 'node:crypto';

export const UI_GAP_COLUMNS = [
  'id',
  'severity',
  'agiSurface',
  'gapType',
  'title',
  'refProduct',
  'refSurface',
  'refScreen',
  'detail',
  'evidence',
  'suggestedFix',
  'image',
  'status',
  'owner',
  'mergedFrom',
];

export const SOURCE_UI_GAP_COLUMNS = UI_GAP_COLUMNS.filter((column) => column !== 'mergedFrom');

export const UI_GAP_SEVERITIES = ['P0', 'P1', 'P2', 'P3'];
export const UI_GAP_SURFACES = ['mobile', 'desktop', 'web', 'extension', 'extension-vscode'];
export const UI_GAP_TYPES = [
  'missing-control',
  'missing-screen',
  'missing-ia',
  'missing-copy',
  'missing-state',
  'missing-interaction',
  'missing-feature',
  'visual-polish',
];
export const UI_GAP_STATUSES = [
  'Open',
  'In Progress',
  'Blocked',
  'Deferred',
  'Done',
  'Not Planned',
];
export const UNRESOLVED_UI_GAP_STATUSES = new Set(['Open', 'In Progress', 'Blocked', 'Deferred']);

function finishCsvField(row, field) {
  row.push(field);
  return '';
}

export function parseCsv(input) {
  const text = input.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else if (character === '\r' && text[index + 1] === '\n') {
        field += '\n';
        index += 1;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      if (field.length > 0) {
        throw new Error(`Unexpected quote in CSV field at character ${index + 1}`);
      }
      quoted = true;
    } else if (character === ',') {
      field = finishCsvField(row, field);
    } else if (character === '\n' || character === '\r') {
      field = finishCsvField(row, field);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      if (character === '\r' && text[index + 1] === '\n') index += 1;
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error('CSV ends inside a quoted field');
  if (field.length > 0 || row.length > 0) {
    finishCsvField(row, field);
    if (row.some((value) => value.length > 0)) rows.push(row);
  }
  if (rows.length === 0) throw new Error('CSV is empty');

  const [columns, ...dataRows] = rows;
  const records = dataRows.map((values, index) => {
    if (values.length !== columns.length) {
      throw new Error(
        `CSV row ${index + 2} has ${values.length} fields; expected ${columns.length}`,
      );
    }
    return Object.fromEntries(columns.map((column, columnIndex) => [column, values[columnIndex]]));
  });

  return { columns, records };
}

function encodeCsvField(value) {
  const text = String(value ?? '');
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

export function serializeCsv(records, columns = UI_GAP_COLUMNS) {
  const lines = [
    columns.map(encodeCsvField).join(','),
    ...records.map((record) => columns.map((column) => encodeCsvField(record[column])).join(',')),
  ];
  return `${lines.join('\n')}\n`;
}

export function sortUiGaps(records) {
  return [...records].sort((left, right) => Number(left.id.slice(4)) - Number(right.id.slice(4)));
}

export function tallyUiGaps(records, key, values) {
  const tally = Object.fromEntries(values.map((value) => [value, 0]));
  for (const record of records) {
    if (Object.hasOwn(tally, record[key])) tally[record[key]] += 1;
  }
  return tally;
}

export function unresolvedSeverityTally(records) {
  const unresolved = records.filter((record) => UNRESOLVED_UI_GAP_STATUSES.has(record.status));
  return tallyUiGaps(unresolved, 'severity', UI_GAP_SEVERITIES);
}

export function csvSha256(csv) {
  return createHash('sha256').update(csv).digest('hex');
}

function inline(value) {
  return String(value).replaceAll('\n', ' ').replaceAll('|', '\\|');
}

function ownerLabel(owner) {
  return owner.trim() || 'Unassigned';
}

export function renderUiGapsMarkdown(records, csv) {
  const severityTally = tallyUiGaps(records, 'severity', UI_GAP_SEVERITIES);
  const surfaceTally = tallyUiGaps(records, 'agiSurface', UI_GAP_SURFACES);
  const statusTally = tallyUiGaps(records, 'status', UI_GAP_STATUSES);
  const unresolved = unresolvedSeverityTally(records);
  const lines = [
    '# agiworkforce UI/UX gap tracker',
    '',
    `<!-- ui-gaps-csv-sha256: ${csvSha256(csv)} -->`,
    '',
    '> Canonical comparison tracker normalized from the ChatGPT, Codex, and Claude UI/UX audit.',
    '> `audit/ui-gaps.csv` is the source of truth; this document is generated with',
    '> `pnpm generate:ui-gaps`. The imported audit is a pre-remediation baseline, so',
    '> evidence must be revalidated against current code before a status is changed.',
    '',
    'GAP-005 was an independent duplicate report of GAP-004 and is preserved on that',
    'record through `mergedFrom`, combined evidence, and both reference screenshots.',
    '',
    '## Tracker rules',
    '',
    '- `Open`, `In Progress`, `Blocked`, and `Deferred` are unresolved.',
    '- `Done` requires current-code verification; `Not Planned` requires an explicit product decision.',
    '- P0/P1 unresolved counts may only decrease relative to the target branch.',
    '- `Unassigned` is explicit debt; replace it with a real owner when work is scheduled.',
    '- Do not add unsupported settings toggles, regulated health features, or private provider-cost data for visual parity.',
    '',
    '## Current snapshot',
    '',
    `- ${records.length} normalized gaps: ${UI_GAP_SEVERITIES.map((severity) => `${severityTally[severity]} ${severity}`).join(', ')}.`,
    `- Unresolved: ${UI_GAP_SEVERITIES.map((severity) => `${unresolved[severity]} ${severity}`).join(', ')}.`,
    '',
    '| Surface | Gaps |',
    '| --- | ---: |',
    ...UI_GAP_SURFACES.map((surface) => `| ${surface} | ${surfaceTally[surface]} |`),
    '',
    '| Status | Gaps |',
    '| --- | ---: |',
    ...UI_GAP_STATUSES.map((status) => `| ${status} | ${statusTally[status]} |`),
    '',
  ];

  for (const severity of UI_GAP_SEVERITIES) {
    lines.push(`## ${severity}`, '');
    for (const record of records.filter((candidate) => candidate.severity === severity)) {
      lines.push(
        `### ${record.id} — ${inline(record.title)}`,
        '',
        `- **Status:** ${record.status}`,
        `- **Owner:** ${ownerLabel(record.owner)}`,
        `- **Surface/type:** ${record.agiSurface} · ${record.gapType}`,
        `- **Reference:** ${inline(record.refProduct)} · ${inline(record.refSurface)} · ${inline(record.refScreen)}`,
      );
      if (record.mergedFrom) lines.push(`- **Merged from:** ${inline(record.mergedFrom)}`);
      lines.push(
        '',
        '**Gap**',
        '',
        record.detail.trim(),
        '',
        '**Evidence**',
        '',
        record.evidence.trim(),
        '',
        '**Suggested fix**',
        '',
        record.suggestedFix.trim(),
        '',
        '**Reference screenshot(s)**',
        '',
      );
      for (const image of record.image
        .split(';')
        .map((value) => value.trim())
        .filter(Boolean)) {
        lines.push(`- \`${image}\``);
      }
      lines.push('');
    }
  }

  return `${lines.join('\n')}\n`;
}
