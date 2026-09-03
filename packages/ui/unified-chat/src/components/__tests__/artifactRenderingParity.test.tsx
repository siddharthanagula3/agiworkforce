import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import {
  parseTabular,
  parseDelimited,
  toCsv,
  toMarkdownTable,
  isNumericCell,
  numericValue,
} from '../../lib/tabular';
import {
  SpreadsheetArtifact,
  SPREADSHEET_ROW_CAP,
} from '../artifact-components/SpreadsheetArtifact';
import { PresentationArtifact, splitSlides } from '../artifact-components/PresentationArtifact';
import { EmailArtifact, parseEmail, emailToText } from '../artifact-components/EmailArtifact';
import type { Artifact } from '../../lib/types';

function makeArtifact(overrides: {
  id: string;
  type: Artifact['type'];
  title?: string;
  content?: string;
}): Artifact {
  return {
    id: overrides.id,
    type: overrides.type,
    title: overrides.title ?? 'Test Artifact',
    content: overrides.content ?? '',
  };
}

describe('parseTabular', () => {
  it('parses plain CSV with a header row', () => {
    const data = parseTabular('name,age\nAlice,30\nBob,25');
    expect(data).not.toBeNull();
    expect(data!.columns).toEqual(['name', 'age']);
    expect(data!.rows).toEqual([
      ['Alice', '30'],
      ['Bob', '25'],
    ]);
    expect(data!.source).toBe('delimited');
    expect(data!.delimiter).toBe(',');
  });

  it('handles quoted fields with embedded commas and escaped quotes', () => {
    const data = parseTabular('name,quote\n"Smith, John","She said ""hi"""');
    expect(data!.rows).toEqual([['Smith, John', 'She said "hi"']]);
  });

  it('handles embedded newlines inside quoted fields', () => {
    const data = parseTabular('name,notes\nAlice,"line one\nline two"\nBob,plain');
    expect(data!.rows).toEqual([
      ['Alice', 'line one\nline two'],
      ['Bob', 'plain'],
    ]);
  });

  it('strips a UTF-8 BOM and tolerates CRLF line endings', () => {
    const data = parseTabular('﻿name,age\r\nAlice,30\r\n');
    expect(data!.columns).toEqual(['name', 'age']);
    expect(data!.rows).toEqual([['Alice', '30']]);
  });

  it('squares off ragged rows (short rows padded, long rows extend columns)', () => {
    const data = parseTabular('a,b\n1\n2,3,4');
    expect(data!.columns).toEqual(['a', 'b', 'Column 3']);
    expect(data!.rows).toEqual([
      ['1', '', ''],
      ['2', '3', '4'],
    ]);
  });

  it('parses TSV via delimiter sniffing', () => {
    const data = parseTabular('name\tage\nAlice\t30');
    expect(data!.delimiter).toBe('\t');
    expect(data!.rows).toEqual([['Alice', '30']]);
  });

  it('parses semicolon-delimited data', () => {
    const data = parseTabular('name;age\nAlice;30');
    expect(data!.delimiter).toBe(';');
    expect(data!.rows).toEqual([['Alice', '30']]);
  });

  it('parses the legacy JSON array-of-objects shape, unioning keys', () => {
    const data = parseTabular(
      JSON.stringify([
        { name: 'Alice', age: 30 },
        { name: 'Bob', city: 'LA' },
      ]),
    );
    expect(data!.source).toBe('json');
    expect(data!.columns).toEqual(['name', 'age', 'city']);
    expect(data!.rows).toEqual([
      ['Alice', '30', ''],
      ['Bob', '', 'LA'],
    ]);
  });

  it('returns null for prose and empty content', () => {
    expect(parseTabular('just a sentence')).toBeNull();
    expect(parseTabular('')).toBeNull();
    expect(parseTabular('   ')).toBeNull();
  });

  it('detects numeric columns including currency and percentages', () => {
    const data = parseTabular('item,price,growth\nA,"$1,200.50",12%\nB,$999,3.4%');
    expect(data!.numericColumns).toEqual([false, true, true]);
    expect(isNumericCell('$1,200.50')).toBe(true);
    expect(isNumericCell('12%')).toBe(true);
    expect(isNumericCell('abc')).toBe(false);
    expect(numericValue('$1,200.50')).toBe(1200.5);
    expect(numericValue('(42)')).toBe(-42);
  });

  it('round-trips through toCsv with proper quoting', () => {
    const csv = 'name,note\n"Smith, John","has ""quotes"" and\nnewline"';
    const data = parseTabular(csv)!;
    expect(toCsv(data)).toBe(csv);
  });

  it('serializes to a markdown table with pipes escaped', () => {
    const data = parseTabular('a,b\nx|y,2')!;
    expect(toMarkdownTable(data)).toBe('| a | b |\n| --- | --- |\n| x\\|y | 2 |');
  });

  it('escapes a backslash before the pipe it precedes, so the cell cannot split', () => {
    const data = parseTabular('a,b\n"x\\|y",2')!;
    const table = toMarkdownTable(data);
    expect(table).toBe('| a | b |\n| --- | --- |\n| x\\\\\\|y | 2 |');
    const rows = table.split('\n').map((line) => line.split(/(?<!\\)\|/).length);
    expect(new Set(rows).size).toBe(1);
  });

  it('parseDelimited drops a blank trailing row from a final newline', () => {
    expect(parseDelimited('a,b\n1,2\n', ',')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('SpreadsheetArtifact interactions', () => {
  const csv = 'name,score\nCharlie,5\nAlice,30\nBob,7';

  it('renders CSV content (the real produced format) as a table', () => {
    render(
      <SpreadsheetArtifact
        artifact={makeArtifact({ id: 't1', type: 'spreadsheet', content: csv })}
      />,
    );
    expect(screen.getByTestId('spreadsheet-table')).toBeDefined();
    expect(screen.getByText('Alice')).toBeDefined();
    expect(screen.getByText(/3 rows · 2 columns/)).toBeDefined();
  });

  it('sorts numerically on header click and cycles asc → desc → original', () => {
    render(
      <SpreadsheetArtifact
        artifact={makeArtifact({ id: 't2', type: 'spreadsheet', content: csv })}
      />,
    );
    const table = screen.getByTestId('spreadsheet-table');
    const firstColumnValues = () =>
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.querySelectorAll('td')[1]!.textContent);

    expect(firstColumnValues()).toEqual(['Charlie', 'Alice', 'Bob']);

    const scoreHeader = screen.getByTitle('Sort by score');
    fireEvent.click(scoreHeader);
    expect(firstColumnValues()).toEqual(['Charlie', 'Bob', 'Alice']);

    fireEvent.click(scoreHeader);
    expect(firstColumnValues()).toEqual(['Alice', 'Bob', 'Charlie']);

    fireEvent.click(scoreHeader);
    expect(firstColumnValues()).toEqual(['Charlie', 'Alice', 'Bob']);
  });

  it('selects a cell and copies it with Ctrl+C', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <SpreadsheetArtifact
        artifact={makeArtifact({ id: 't3', type: 'spreadsheet', content: csv })}
      />,
    );
    fireEvent.click(screen.getByText('Alice'));
    const grid = screen.getByRole('group');
    await act(async () => {
      fireEvent.keyDown(grid, { key: 'c', ctrlKey: true });
    });
    expect(writeText).toHaveBeenCalledWith('Alice');
  });

  it('caps rendered rows with an honest truncation note', () => {
    const rows = Array.from({ length: SPREADSHEET_ROW_CAP + 20 }, (_, i) => `r${i},${i}`);
    const bigCsv = `name,n\n${rows.join('\n')}`;
    render(
      <SpreadsheetArtifact
        artifact={makeArtifact({ id: 't4', type: 'spreadsheet', content: bigCsv })}
      />,
    );
    const note = screen.getByTestId('spreadsheet-truncation-note');
    expect(note.textContent).toContain(
      `Showing first ${SPREADSHEET_ROW_CAP} of ${SPREADSHEET_ROW_CAP + 20} rows`,
    );
    expect(screen.queryByText(`r${SPREADSHEET_ROW_CAP + 5}`)).toBeNull();
  });

  it('right-aligns numeric columns', () => {
    render(
      <SpreadsheetArtifact
        artifact={makeArtifact({ id: 't5', type: 'spreadsheet', content: csv })}
      />,
    );
    const cell = screen.getByText('30');
    expect(cell.className).toContain('text-right');
  });
});

describe('splitSlides', () => {
  it('splits on --- separator lines including CRLF and extra dashes', () => {
    expect(splitSlides('# One\r\n---\r\n# Two\n ---- \n# Three')).toEqual([
      '# One',
      '# Two',
      '# Three',
    ]);
  });

  it('falls back to heading boundaries when no separators exist', () => {
    expect(splitSlides('# One\nbody\n## Two\nmore')).toEqual(['# One\nbody', '## Two\nmore']);
  });

  it('returns [] for empty content', () => {
    expect(splitSlides('   ')).toEqual([]);
  });
});

describe('PresentationArtifact navigation', () => {
  const deck = '# Alpha\n---\n# Beta\n---\n# Gamma';

  it('navigates with keyboard arrows, Home and End', () => {
    render(
      <PresentationArtifact
        artifact={makeArtifact({ id: 'p1', type: 'presentation', content: deck })}
      />,
    );
    const region = screen.getByTestId('presentation-artifact');
    expect(screen.getByText('Alpha')).toBeDefined();

    fireEvent.keyDown(region, { key: 'ArrowRight' });
    expect(screen.getByText('Beta')).toBeDefined();

    fireEvent.keyDown(region, { key: 'End' });
    expect(screen.getByText('Gamma')).toBeDefined();

    fireEvent.keyDown(region, { key: 'ArrowLeft' });
    expect(screen.getByText('Beta')).toBeDefined();

    fireEvent.keyDown(region, { key: 'Home' });
    expect(screen.getByText('Alpha')).toBeDefined();
  });

  it('shows clickable slide dots that jump to a slide', () => {
    render(
      <PresentationArtifact
        artifact={makeArtifact({ id: 'p2', type: 'presentation', content: deck })}
      />,
    );
    const dots = within(screen.getByTestId('presentation-dots')).getAllByRole('button');
    expect(dots).toHaveLength(3);
    fireEvent.click(dots[2]!);
    expect(screen.getByText('Gamma')).toBeDefined();
    expect(dots[2]!.getAttribute('aria-current')).toBe('true');
  });

  it('shows the x / y indicator on the slide card', () => {
    render(
      <PresentationArtifact
        artifact={makeArtifact({ id: 'p3', type: 'presentation', content: deck })}
      />,
    );
    fireEvent.click(screen.getByLabelText('Next slide'));
    expect(screen.getByText('2 / 3')).toBeDefined();
  });
});

describe('parseEmail', () => {
  it('parses a leading header block and body', () => {
    const parsed = parseEmail(
      'Subject: Quarterly update\nTo: team@example.com\nFrom: me@example.com\n\nHi team,\n\nNumbers below.',
    );
    expect(parsed.headers.subject).toBe('Quarterly update');
    expect(parsed.headers.to).toBe('team@example.com');
    expect(parsed.headers.from).toBe('me@example.com');
    expect(parsed.body).toBe('Hi team,\n\nNumbers below.');
  });

  it('treats content without headers entirely as body, nothing dropped', () => {
    const parsed = parseEmail('Hi team,\n\nSubject changed since last time.');
    expect(parsed.headers).toEqual({});
    expect(parsed.body).toBe('Hi team,\n\nSubject changed since last time.');
  });

  it('emailToText round-trips headers and body', () => {
    const parsed = parseEmail('Subject: Hello\nTo: a@b.c\n\nBody text');
    expect(emailToText(parsed)).toBe('To: a@b.c\nSubject: Hello\n\nBody text');
  });
});

describe('EmailArtifact', () => {
  const draft =
    'Subject: Launch plan\nTo: team@example.com\nCc: exec@example.com\n\n**Hi all**, see plan.';

  it('renders email chrome with subject and recipient rows', () => {
    render(<EmailArtifact artifact={makeArtifact({ id: 'e1', type: 'email', content: draft })} />);
    expect(screen.getByTestId('email-artifact')).toBeDefined();
    expect(screen.getByTestId('email-subject').textContent).toBe('Launch plan');
    expect(screen.getByText('team@example.com')).toBeDefined();
    expect(screen.getByText('exec@example.com')).toBeDefined();
    expect(screen.getByText('Hi all').tagName).toBe('STRONG');
  });

  it('copies the email as plain text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<EmailArtifact artifact={makeArtifact({ id: 'e2', type: 'email', content: draft })} />);
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Copy email as text'));
    });
    expect(writeText).toHaveBeenCalledWith(
      'To: team@example.com\nCc: exec@example.com\nSubject: Launch plan\n\n**Hi all**, see plan.',
    );
  });

  it('falls back to the artifact title and body-only render without headers', () => {
    render(
      <EmailArtifact
        artifact={makeArtifact({
          id: 'e3',
          type: 'email',
          title: 'Draft',
          content: 'Just a body.',
        })}
      />,
    );
    expect(screen.getByTestId('email-subject').textContent).toBe('Draft');
    expect(screen.getByText('Just a body.')).toBeDefined();
  });

  it('shows an empty state for empty content', () => {
    render(<EmailArtifact artifact={makeArtifact({ id: 'e4', type: 'email', content: '  ' })} />);
    expect(screen.getByTestId('email-artifact-empty')).toBeDefined();
  });
});
