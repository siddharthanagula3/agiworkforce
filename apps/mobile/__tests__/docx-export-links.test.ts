import { ExternalHyperlink, TextRun } from 'docx';
import { markdownToDocxBase64, runs } from '@/services/docxExport';

function hyperlinks(markdown: string): ExternalHyperlink[] {
  return runs(markdown).filter((run): run is ExternalHyperlink => run instanceof ExternalHyperlink);
}

describe('docx inline links', () => {
  it('keeps the destination of an inline link as a Word hyperlink', () => {
    const [link] = hyperlinks('Read the [Source](https://example.invalid/report) first.');

    expect(link?.options.link).toBe('https://example.invalid/report');
  });

  it('drops a link title and keeps the label text around it', () => {
    const markdown = 'See [Source](https://example.invalid/report "The report") now';

    expect(runs(markdown)).toHaveLength(3);
    expect(hyperlinks(markdown)[0]?.options.link).toBe('https://example.invalid/report');
  });

  it('keeps a mailto destination', () => {
    expect(hyperlinks('[Write us](mailto:team@example.invalid)')[0]?.options.link).toBe(
      'mailto:team@example.invalid',
    );
  });

  it('shows the address when the label is empty so the reference survives', () => {
    expect(hyperlinks('[](https://example.invalid/report)')).toHaveLength(1);
  });

  it('does not turn an unsafe destination into a clickable link', () => {
    const parts = runs('[Run](javascript:alert(1)) and [Local](/internal/path)');

    expect(parts.some((part) => part instanceof ExternalHyperlink)).toBe(false);
    expect(parts.every((part) => part instanceof TextRun)).toBe(true);
  });

  it('keeps an image as its alt text rather than a link', () => {
    const parts = runs('![Chart](https://example.invalid/chart.png)');

    expect(parts.some((part) => part instanceof ExternalHyperlink)).toBe(false);
  });

  it('packs a document that contains links', async () => {
    const base64 = await markdownToDocxBase64(
      '# Report\n\n- [Source](https://example.invalid/report)\n\n| A |\n| --- |\n| [B](https://example.invalid/b) |',
      'Report',
    );

    expect(base64.length).toBeGreaterThan(0);
  });
});
