import { API_URL } from '@/lib/constants';
import type { Artifact } from '@/types/chat';
import {
  artifactViewerKind,
  isWorkbookFile,
  storedImagePath,
  viewerSourceForArtifact,
  type ArtifactViewerSource,
} from '../viewerKind';

const ASSET = '0b9c2f4e-7a1d-4c3b-9e8f-1a2b3c4d5e6f';
const BASE = API_URL.replace(/\/+$/, '');

function file(fileName: string, mimeType: string, url = `${BASE}/api/files/${ASSET}`) {
  return { origin: 'file', title: fileName, fileName, mimeType, url } as ArtifactViewerSource;
}

describe('artifactViewerKind', () => {
  it('draws PDF and Office files in the document view', () => {
    expect(artifactViewerKind(file('report.pdf', 'application/pdf'))).toBe('document');
    expect(
      artifactViewerKind(
        file(
          'brief.docx',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ),
      ),
    ).toBe('document');
    expect(artifactViewerKind(file('deck.pptx', 'application/octet-stream'))).toBe('document');
    expect(artifactViewerKind(file('model.xlsx', 'application/octet-stream'))).toBe('document');
  });

  it('knows an XLSX workbook by its type or its name, and nothing else', () => {
    const workbook = (fileName: string, mimeType: string) => ({
      title: fileName,
      fileName,
      mimeType,
      url: `${BASE}/api/files/${ASSET}`,
    });
    expect(
      isWorkbookFile(
        workbook('q3', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
      ),
    ).toBe(true);
    expect(isWorkbookFile(workbook('model.xlsx', 'application/octet-stream'))).toBe(true);
    expect(isWorkbookFile(workbook('sales.csv', 'text/csv'))).toBe(false);
    expect(isWorkbookFile(workbook('deck.pptx', 'application/octet-stream'))).toBe(false);
  });

  it('draws CSV and TSV files as a grid and other text files as text', () => {
    expect(artifactViewerKind(file('sales.csv', 'text/csv'))).toBe('table');
    expect(artifactViewerKind(file('sales.tsv', 'text/tab-separated-values'))).toBe('table');
    expect(artifactViewerKind(file('notes.md', 'text/markdown'))).toBe('text');
    expect(artifactViewerKind(file('data.json', 'application/json'))).toBe('text');
  });

  it('draws a stored or on-device picture, and no picture from another site', () => {
    expect(artifactViewerKind(file('chart.png', 'image/png'))).toBe('image');
    expect(artifactViewerKind(file('photo.jpg', 'image/jpeg', 'file:///tmp/photo.jpg'))).toBe(
      'image',
    );
    expect(
      artifactViewerKind(file('remote.png', 'image/png', 'https://example.test/remote.png')),
    ).toBeNull();
  });

  it('reports no viewer for a type it cannot draw', () => {
    expect(artifactViewerKind(file('bundle.zip', 'application/zip'))).toBeNull();
    expect(
      artifactViewerKind({ origin: 'inline', title: 'main.py', content: 'x', language: 'python' }),
    ).toBeNull();
  });

  it('draws a CSV artifact written in the answer as a grid', () => {
    expect(
      artifactViewerKind({ origin: 'inline', title: 'Sales', content: 'a,b', language: 'csv' }),
    ).toBe('table');
  });
});

describe('storedImagePath', () => {
  it('turns the resolved file address back into the authorised path', () => {
    expect(storedImagePath(`${BASE}/api/files/${ASSET}`)).toBe(`/api/files/${ASSET}`);
    expect(storedImagePath(`/api/files/${ASSET}`)).toBe(`/api/files/${ASSET}`);
    expect(storedImagePath(`${BASE}/api/files/not-an-asset`)).toBeNull();
  });
});

describe('viewerSourceForArtifact', () => {
  it('opens a generated file by its file, and any other artifact by its text', () => {
    const generated = {
      id: 'a1',
      type: 'document',
      title: 'report.pdf',
      content: '',
      generatedFile: {
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
        uri: `${BASE}/api/files/${ASSET}`,
        byteCount: 2048,
      },
    } as unknown as Artifact;
    expect(viewerSourceForArtifact(generated)).toEqual({
      origin: 'file',
      title: 'report.pdf',
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      url: `${BASE}/api/files/${ASSET}`,
      byteCount: 2048,
    });
    expect(
      viewerSourceForArtifact({
        id: 'a2',
        type: 'code',
        title: 'Sales',
        content: 'a,b\n1,2',
        language: 'csv',
      }),
    ).toEqual({ origin: 'inline', title: 'Sales', content: 'a,b\n1,2', language: 'csv' });
  });
});
