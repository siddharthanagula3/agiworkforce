import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import {
  createManagedOfficeFileToolDefinition,
  generateManagedOfficeFile,
} from './managed-office-file-service';

describe('managed Office file service', () => {
  it('offers one path-free DOCX/PPTX tool definition', () => {
    const definition = createManagedOfficeFileToolDefinition();
    const serialized = JSON.stringify(definition);

    expect(definition.function.name).toBe('create_office_file');
    expect(serialized).toContain('docx');
    expect(serialized).toContain('pptx');
    expect(serialized).not.toMatch(/file[_ ]?path|directory|host path/i);
  });

  it('rejects host paths and oversized document content', async () => {
    await expect(
      generateManagedOfficeFile({
        format: 'docx',
        filename: '/tmp/report.docx',
        title: 'Quarterly report',
        content: 'Safe content',
      }),
    ).resolves.toEqual({
      ok: false,
      code: 'invalid_office_file_request',
      message: 'The Office file request is invalid.',
    });

    await expect(
      generateManagedOfficeFile({
        format: 'docx',
        filename: 'report.docx',
        title: 'Quarterly report',
        content: 'x'.repeat(100_001),
      }),
    ).resolves.toEqual({
      ok: false,
      code: 'invalid_office_file_request',
      message: 'The Office file request is invalid.',
    });
  });

  it('creates a real DOCX package with the requested content', async () => {
    const result = await generateManagedOfficeFile({
      format: 'docx',
      filename: 'launch-brief',
      title: 'Launch brief',
      content: '# Priorities\n\n- Website\n- Mobile\n\nShip the real behavior.',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.filename).toBe('launch-brief.docx');
    expect(result.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(result.data.subarray(0, 2).toString()).toBe('PK');

    const archive = await JSZip.loadAsync(result.data);
    const documentXml = await archive.file('word/document.xml')?.async('string');
    const stylesXml = await archive.file('word/styles.xml')?.async('string');
    const numberingXml = await archive.file('word/numbering.xml')?.async('string');
    expect(documentXml).toContain('Launch brief');
    expect(documentXml).toContain('Website');
    expect(documentXml).toContain('Ship the real behavior.');
    expect(documentXml).toMatch(/<w:pgSz[^>]*w:w="12240"[^>]*w:h="15840"/);
    expect(documentXml).toMatch(
      /<w:pgMar[^>]*w:top="1440"[^>]*w:right="1440"[^>]*w:bottom="1440"[^>]*w:left="1440"[^>]*w:header="708"[^>]*w:footer="708"/,
    );
    expect(stylesXml).toMatch(/<w:style[^>]*w:styleId="Heading1"[\s\S]*?<w:sz w:val="32"/);
    expect(stylesXml).toMatch(/<w:style[^>]*w:styleId="Heading1"[\s\S]*?<w:color w:val="2E74B5"/);
    expect(numberingXml).toMatch(/<w:numFmt w:val="bullet"/);
    expect(numberingXml).toMatch(/<w:ind w:left="720" w:hanging="360"/);
    expect(numberingXml).toMatch(/<w:spacing w:after="160" w:line="280"/);
  });

  it('creates a real PPTX package with editable slide text', async () => {
    const result = await generateManagedOfficeFile({
      format: 'pptx',
      filename: 'release-plan.pptx',
      title: 'Release plan',
      slides: [
        {
          title: 'Release order',
          bullets: ['Website first', 'Mobile second', 'Desktop third'],
          speaker_notes: 'Keep lower-priority surfaces out of this release.',
        },
        {
          title: 'Definition of done',
          bullets: ['Real behavior', 'Focused tests', 'Verified build'],
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.filename).toBe('release-plan.pptx');
    expect(result.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
    expect(result.data.subarray(0, 2).toString()).toBe('PK');

    const archive = await JSZip.loadAsync(result.data);
    expect(archive.file('ppt/presentation.xml')).not.toBeNull();
    const firstSlideXml = await archive.file('ppt/slides/slide1.xml')?.async('string');
    expect(firstSlideXml).toContain('Release order');
    expect(firstSlideXml).toContain('Website first');
    expect(firstSlideXml).toContain('Desktop third');
    expect(firstSlideXml?.indexOf('Release order')).toBeLessThan(
      firstSlideXml?.indexOf('>AGI<') ?? -1,
    );
  });
});
