import {
  DEVELOPER_EVAL_CASES_MAX,
  type DeveloperEvalCaseInput,
} from '@agiworkforce/cloud-contracts';

const EXPECTED_COLUMN = 'expected';
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);
const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

export type ParsedCases =
  { ok: true; cases: DeveloperEvalCaseInput[] } | { ok: false; error: string };

function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((cell) => cell.trim() !== ''));
}

export function parseCasesCsv(text: string): ParsedCases {
  const rows = parseRows(text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text);
  const [header, ...body] = rows;
  if (!header || body.length === 0) {
    return { ok: false, error: 'The CSV needs a header row and at least one case.' };
  }
  const names = header.map((cell) => cell.trim());
  const invalid = names.find((name) => name !== EXPECTED_COLUMN && !NAME_PATTERN.test(name));
  if (invalid !== undefined) {
    return { ok: false, error: `“${invalid}” is not a variable name a template can use.` };
  }
  if (body.length > DEVELOPER_EVAL_CASES_MAX) {
    return { ok: false, error: `A prompt holds up to ${DEVELOPER_EVAL_CASES_MAX} test cases.` };
  }
  return {
    ok: true,
    cases: body.map((cells) => {
      const variables: Record<string, string> = {};
      let expectedOutput: string | null = null;
      names.forEach((name, index) => {
        const value = cells[index] ?? '';
        if (name === EXPECTED_COLUMN) expectedOutput = value.trim() ? value : null;
        else variables[name] = value;
      });
      return { variables, expectedOutput };
    }),
  };
}
