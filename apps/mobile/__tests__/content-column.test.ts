import {
  FORM_COLUMN_MAX_WIDTH,
  READING_COLUMN_MAX_WIDTH,
  contentColumn,
  contentColumnInset,
  contentColumnWidth,
} from '@/src/shared/layout/contentColumn';

const WIDEST_PHONE_WINDOW = 440;
const TABLET_PORTRAIT = 1032;
const TABLET_LANDSCAPE = 1376;

describe('content columns', () => {
  it('never narrows a phone window', () => {
    expect(FORM_COLUMN_MAX_WIDTH).toBeGreaterThanOrEqual(WIDEST_PHONE_WINDOW);
    expect(READING_COLUMN_MAX_WIDTH).toBeGreaterThanOrEqual(WIDEST_PHONE_WINDOW);
    for (const kind of ['reading', 'form', 'grid'] as const) {
      expect(contentColumnWidth(kind, WIDEST_PHONE_WINDOW)).toBe(WIDEST_PHONE_WINDOW);
      expect(contentColumnInset(kind, WIDEST_PHONE_WINDOW)).toBe(0);
    }
  });

  it('holds a form and a reading column to their widths on a tablet', () => {
    expect(contentColumn('form')).toEqual({
      width: '100%',
      maxWidth: FORM_COLUMN_MAX_WIDTH,
      alignSelf: 'center',
    });
    expect(contentColumnWidth('form', TABLET_PORTRAIT)).toBe(FORM_COLUMN_MAX_WIDTH);
    expect(contentColumnWidth('reading', TABLET_LANDSCAPE)).toBe(READING_COLUMN_MAX_WIDTH);
  });

  it('gives the margin that centres a column in the space it has', () => {
    expect(contentColumnInset('reading', TABLET_LANDSCAPE)).toBe(
      (TABLET_LANDSCAPE - READING_COLUMN_MAX_WIDTH) / 2,
    );
    expect(contentColumnInset('form', TABLET_PORTRAIT)).toBe(
      (TABLET_PORTRAIT - FORM_COLUMN_MAX_WIDTH) / 2,
    );
    expect(contentColumnInset('reading', -5)).toBe(0);
  });
});
