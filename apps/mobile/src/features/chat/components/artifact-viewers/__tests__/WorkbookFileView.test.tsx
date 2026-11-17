/* eslint-disable @typescript-eslint/no-require-imports */
const mockViewerFileCopy = jest.fn();
const mockShareFile = jest.fn().mockResolvedValue(undefined);
const mockFileBytes = jest.fn();
const mockExportSourceFile = jest.fn();

jest.mock('@/services/fileCreation', () => ({
  downloadGeneratedFile: (...args: unknown[]) => mockViewerFileCopy(...args),
  viewerFileCopy: (...args: unknown[]) => mockViewerFileCopy(...args),
  shareFile: (uri: string) => mockShareFile(uri),
  exportSourceFile: (...args: unknown[]) => mockExportSourceFile(...args),
}));
jest.mock('expo-file-system', () => ({
  File: class {
    path: string;
    constructor(path: string) {
      this.path = path;
    }
    bytes() {
      return mockFileBytes(this.path);
    }
  },
}));
jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: () => ({ ownerId: 'user-1', epoch: 1 }),
}));
jest.mock('@/lib/mmkv', () => ({
  rehydrateWhenMmkvReady: jest.fn(),
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));
jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  return new Proxy(
    {},
    {
      get: (_target, name) =>
        name === '__esModule' ? true : (props: Record<string, unknown>) => <RN.View {...props} />,
    },
  );
});

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { strToU8, zipSync } from 'fflate';
import { MAX_FILE_TEXT_CHARS } from '@agiworkforce/types';
import { ApiHttpError } from '@/services/apiErrors';
import { WORKBOOK_TOO_LARGE_TITLE, WorkbookFileView } from '../WorkbookFileView';
import type { FileViewerSource } from '../viewerKind';

const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const LOCAL = 'file:///cache/file-views/q3.xlsx';

function noise(length: number, seed: number): string {
  let state = seed;
  let text = '';
  for (let index = 0; index < length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    text += String.fromCharCode(97 + ((state >>> 0) % 26));
  }
  return text;
}

function xlsx(sheets: { name: string; rows: string }[]): Uint8Array {
  const files: Record<string, Uint8Array> = {
    'xl/workbook.xml': strToU8(
      `<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><sheets>${sheets
        .map(
          (sheet, index) =>
            `<sheet name="${sheet.name}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
        )
        .join('')}</sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
        .map(
          (_, index) =>
            `<Relationship Id="rId${index + 1}" Type="${REL_NS}/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
        )
        .join('')}</Relationships>`,
    ),
  };
  sheets.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(
      `<worksheet xmlns="${MAIN_NS}"><sheetData>${sheet.rows}</sheetData></worksheet>`,
    );
  });
  return zipSync(files);
}

function row(...values: string[]): string {
  return `<row>${values.map((value) => `<c t="inlineStr"><is><t>${value}</t></is></c>`).join('')}</row>`;
}

let sequence = 0;
function workbookSource(): FileViewerSource {
  sequence += 1;
  return {
    title: 'q3.xlsx',
    fileName: 'q3.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    url: `https://files.example.test/api/files/workbook-${sequence}`,
  };
}

describe('WorkbookFileView', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    mockViewerFileCopy.mockResolvedValue(LOCAL);
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
  });

  it('shows a spinner, then every sheet as a tab over the first sheet, read from the device copy', async () => {
    mockFileBytes.mockResolvedValue(
      xlsx([
        { name: 'Revenue', rows: row('Region', 'Revenue') + row('North', '1200') },
        { name: 'Costs', rows: row('Item', 'Cost') + row('Rent', '400') },
        { name: 'Notes', rows: row('Owner') + row('Sam') },
      ]),
    );
    const source = workbookSource();
    render(<WorkbookFileView source={source} />);

    expect(screen.getByTestId('workbook-file-loading')).toBeTruthy();
    expect(screen.getByLabelText('Opening q3.xlsx')).toBeTruthy();

    expect(await screen.findByTestId('tabular-sheet-tabs')).toBeTruthy();
    expect(mockViewerFileCopy).toHaveBeenCalledWith(source.url, 'q3.xlsx');
    expect(mockFileBytes).toHaveBeenCalledWith(LOCAL);
    expect(screen.getByTestId('tabular-sheet-tab-0').props.accessibilityState.selected).toBe(true);
    expect(screen.getByText('North')).toBeTruthy();

    fireEvent.press(screen.getByTestId('tabular-sheet-tab-2'));
    expect(screen.getByText('Sam')).toBeTruthy();
    expect(screen.queryByText('North')).toBeNull();
  });

  it('draws a one-sheet workbook as a grid with no tabs', async () => {
    mockFileBytes.mockResolvedValue(
      xlsx([{ name: 'Only', rows: row('Region', 'Revenue') + row('South', '900') }]),
    );
    render(<WorkbookFileView source={workbookSource()} />);

    expect(await screen.findByTestId('tabular-grid')).toBeTruthy();
    expect(screen.getByText('South')).toBeTruthy();
    expect(screen.queryByTestId('tabular-sheet-tabs')).toBeNull();
  });

  function tooLargeWorkbook(): Uint8Array {
    const size = Math.ceil(MAX_FILE_TEXT_CHARS / 2) + 1;
    return xlsx([
      { name: 'One', rows: row(noise(size, 1)) },
      { name: 'Two', rows: row(noise(size, 2)) },
    ]);
  }

  it('keeps the in-app document view on iOS for a workbook past the preview limit', async () => {
    mockFileBytes.mockResolvedValue(tooLargeWorkbook());
    render(<WorkbookFileView source={workbookSource()} />);

    expect(await screen.findByTestId('document-file-frame')).toBeTruthy();
    expect(screen.queryByTestId('workbook-file-too-large')).toBeNull();
    expect(screen.queryByTestId('tabular-grid')).toBeNull();
  });

  it('says a workbook past the preview limit is too large on Android and offers Share', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    mockFileBytes.mockResolvedValue(tooLargeWorkbook());
    render(<WorkbookFileView source={workbookSource()} />);

    expect(await screen.findByTestId('workbook-file-too-large')).toBeTruthy();
    expect(screen.getByText(WORKBOOK_TOO_LARGE_TITLE)).toBeTruthy();
    expect(screen.queryByTestId('tabular-grid')).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('Share q3.xlsx'));
    });
    expect(mockShareFile).toHaveBeenCalledWith(LOCAL);
  });

  it('shares a sheet as CSV under the workbook name without its extension', async () => {
    mockExportSourceFile.mockResolvedValue({ uri: 'file:///exports/q3 Costs.csv' });
    mockFileBytes.mockResolvedValue(
      xlsx([
        { name: 'Revenue', rows: row('Region', 'Revenue') + row('North', '1200') },
        { name: 'Costs', rows: row('Item', 'Cost') + row('Rent', '400') },
      ]),
    );
    render(<WorkbookFileView source={workbookSource()} />);

    fireEvent.press(await screen.findByTestId('tabular-sheet-tab-1'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('tabular-share-csv'));
    });

    expect(mockExportSourceFile).toHaveBeenCalledWith(expect.any(String), 'q3 Costs', 'csv');
  });

  it('falls back to the document view when the file is not a workbook it can read', async () => {
    mockFileBytes.mockResolvedValue(strToU8('not a zip archive'));
    render(<WorkbookFileView source={workbookSource()} />);

    expect(await screen.findByTestId('document-file-frame')).toBeTruthy();
    expect(screen.queryByTestId('tabular-grid')).toBeNull();
  });

  it('falls back to the document view when the workbook has no sheets', async () => {
    mockFileBytes.mockResolvedValue(xlsx([]));
    render(<WorkbookFileView source={workbookSource()} />);

    expect(await screen.findByTestId('document-file-frame')).toBeTruthy();
  });

  it('offers Retry when the file cannot be fetched, and reads it once it can', async () => {
    mockViewerFileCopy.mockRejectedValueOnce(new Error('Download failed (HTTP 500)'));
    mockFileBytes.mockResolvedValue(xlsx([{ name: 'Only', rows: row('A') + row('1') }]));
    render(<WorkbookFileView source={workbookSource()} />);

    expect(await screen.findByTestId('workbook-file-failed')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Retry'));
    });

    expect(await screen.findByTestId('tabular-grid')).toBeTruthy();
  });

  it('says a workbook above the download limit is too large and offers no Retry', async () => {
    mockViewerFileCopy.mockRejectedValueOnce(
      new ApiHttpError('This file is too large to open on this device.', 413, 'file_too_large'),
    );
    render(<WorkbookFileView source={workbookSource()} />);

    expect(await screen.findByTestId('workbook-file-failed')).toBeTruthy();
    expect(screen.getByText('This file is too large to open on this device.')).toBeTruthy();
    expect(screen.queryByText('Retry')).toBeNull();
  });
});
