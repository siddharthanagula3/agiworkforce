import { describe, expect, it } from 'vitest';
import {
  formatDeliverableCategoryLabel,
  formatDeliverableFormatLabel,
  formatDeliverableTypeLine,
} from '../suite-contracts';

describe('formatDeliverableTypeLine', () => {
  it('reads as the leaders do for the three observed deliverable kinds', () => {
    expect(formatDeliverableTypeLine({ kind: 'pdf', fileName: 'report.pdf' })).toBe(
      'Document, PDF',
    );
    expect(formatDeliverableTypeLine({ kind: 'pptx', fileName: 'deck.pptx' })).toBe(
      'Presentation, PPTX',
    );
    expect(formatDeliverableTypeLine({ kind: 'markdown', fileName: 'brief.md' })).toBe(
      'Document, MD',
    );
  });

  it('groups spreadsheets, data, images and archives by category', () => {
    expect(formatDeliverableCategoryLabel('csv')).toBe('Spreadsheet');
    expect(formatDeliverableCategoryLabel('xlsx')).toBe('Spreadsheet');
    expect(formatDeliverableCategoryLabel('json')).toBe('Data');
    expect(formatDeliverableCategoryLabel('image')).toBe('Image');
    expect(formatDeliverableCategoryLabel('archive')).toBe('Archive');
  });

  it('infers the category from the name and mime when the record carries no kind', () => {
    expect(formatDeliverableTypeLine({ fileName: 'report.pdf', mimeType: 'application/pdf' })).toBe(
      'Document, PDF',
    );
    expect(formatDeliverableTypeLine({ fileName: 'data.csv', mimeType: 'text/csv' })).toBe(
      'Spreadsheet, CSV',
    );
    expect(formatDeliverableTypeLine({ fileName: 'chart.png', mimeType: 'image/png' })).toBe(
      'Image, PNG',
    );
  });

  it('falls back to File for an unknown or missing kind', () => {
    expect(formatDeliverableCategoryLabel(null)).toBe('File');
    expect(formatDeliverableCategoryLabel('sqlite')).toBe('File');
    expect(formatDeliverableTypeLine({ kind: 'sqlite', fileName: 'db.sqlite' })).toBe(
      'File, SQLITE',
    );
  });

  it('derives the format from the mime type when the name carries no extension', () => {
    expect(formatDeliverableFormatLabel({ mimeType: 'text/csv' })).toBe('CSV');
    expect(
      formatDeliverableFormatLabel({
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      }),
    ).toBe('PRESENTATION');
    expect(formatDeliverableFormatLabel({ mimeType: 'image/svg+xml' })).toBe('SVG');
  });

  it('drops a format that only repeats the category', () => {
    expect(formatDeliverableTypeLine({ kind: 'image', fileName: 'chart' })).toBe('Image');
    expect(formatDeliverableTypeLine({ kind: 'other', fileName: 'notes' })).toBe('File');
  });
});
