/* eslint-disable @typescript-eslint/no-require-imports */
const mockDownloadGeneratedFile = jest.fn();
const mockShareFile = jest.fn().mockResolvedValue(undefined);
const mockReadAsStringAsync = jest.fn();
const mockFileBytes = jest.fn();

jest.mock('@/services/fileCreation', () => ({
  downloadGeneratedFile: (...args: unknown[]) => mockDownloadGeneratedFile(...args),
  viewerFileCopy: (...args: unknown[]) => mockDownloadGeneratedFile(...args),
  shareFile: (uri: string) => mockShareFile(uri),
  exportSourceFile: jest.fn(),
}));
jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: (uri: string) => mockReadAsStringAsync(uri),
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
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
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
import { Modal } from 'react-native';
import { strToU8, zipSync } from 'fflate';
import { NavigationContext } from 'expo-router/react-navigation';
import { FULL_SCREEN_TOUCH_TARGET } from '@/src/features/chat/chrome/fullScreenChrome';
import { tapTarget } from '@/test-utils/viewerChrome';
import { FileViewerScreen } from '../FileViewerScreen';
import type { FileViewerSource } from '../viewerKind';

function source(overrides: Partial<FileViewerSource>): FileViewerSource {
  return {
    title: 'notes.md',
    fileName: 'notes.md',
    mimeType: 'text/markdown',
    url: 'https://files.example.test/api/projects/p1/knowledge-files/f1',
    byteCount: 2048,
    ...overrides,
  };
}

describe('FileViewerScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens as a sheet below the status bar with a 44 point Close, and the swipe down closes it', async () => {
    mockDownloadGeneratedFile.mockResolvedValue('file:///exports/notes.md');
    mockReadAsStringAsync.mockResolvedValue('# Plan');
    const onClose = jest.fn();
    render(<FileViewerScreen source={source({})} onClose={onClose} />);
    await screen.findByText('# Plan');

    const sheet = screen.UNSAFE_getByType(Modal).props;
    expect(sheet.presentationStyle).toBe('pageSheet');
    const close = screen.getByLabelText('Close file');
    expect(tapTarget(close).width).toBeGreaterThanOrEqual(FULL_SCREEN_TOUCH_TARGET);
    expect(tapTarget(close).height).toBeGreaterThanOrEqual(FULL_SCREEN_TOUCH_TARGET);

    act(() => sheet.onRequestClose());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a text file line by line with its size and the cited page', async () => {
    mockDownloadGeneratedFile.mockResolvedValue('file:///exports/notes.md');
    mockReadAsStringAsync.mockResolvedValue('# Plan\nShip on Friday');
    render(<FileViewerScreen source={source({})} page={3} onClose={jest.fn()} />);

    expect(await screen.findByText('Ship on Friday')).toBeTruthy();
    expect(screen.getByText('# Plan')).toBeTruthy();
    expect(screen.getByText('2 KB · Page 3')).toBeTruthy();
    expect(mockReadAsStringAsync).toHaveBeenCalledWith('file:///exports/notes.md');
  });

  it('writes a file under 1 KB with the same B unit its Library row uses', async () => {
    mockDownloadGeneratedFile.mockResolvedValue('file:///exports/notes.md');
    mockReadAsStringAsync.mockResolvedValue('# Plan');
    render(<FileViewerScreen source={source({ byteCount: 129 })} onClose={jest.fn()} />);

    await screen.findByText('# Plan');
    expect(screen.getByText('129 B')).toBeTruthy();
    expect(screen.queryByText(/Bytes/)).toBeNull();
  });

  it('reads an XLSX file into one tab per sheet', async () => {
    const sheet = (value: string) =>
      strToU8(
        `<worksheet><sheetData><row><c t="inlineStr"><is><t>${value}</t></is></c></row></sheetData></worksheet>`,
      );
    mockDownloadGeneratedFile.mockResolvedValue('file:///cache/file-views/q3.xlsx');
    mockFileBytes.mockResolvedValue(
      zipSync({
        'xl/workbook.xml': strToU8(
          '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="North" r:id="rId1"/><sheet name="South" r:id="rId2"/></sheets></workbook>',
        ),
        'xl/_rels/workbook.xml.rels': strToU8(
          '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
        ),
        'xl/worksheets/sheet1.xml': sheet('Oslo'),
        'xl/worksheets/sheet2.xml': sheet('Lima'),
      }),
    );
    render(
      <FileViewerScreen
        source={source({
          title: 'q3.xlsx',
          fileName: 'q3.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          url: 'https://files.example.test/api/files/q3',
        })}
        onClose={jest.fn()}
      />,
    );

    expect(await screen.findByTestId('tabular-sheet-tabs')).toBeTruthy();
    expect(screen.getByText('Oslo')).toBeTruthy();
    fireEvent.press(screen.getByTestId('tabular-sheet-tab-1'));
    expect(screen.getByText('Lima')).toBeTruthy();
    expect(mockFileBytes).toHaveBeenCalledWith('file:///cache/file-views/q3.xlsx');
  });

  it('draws a CSV file as a grid', async () => {
    mockDownloadGeneratedFile.mockResolvedValue('file:///exports/sales.csv');
    mockReadAsStringAsync.mockResolvedValue('Region,Revenue\nNorth,1200');
    render(
      <FileViewerScreen
        source={source({
          title: 'sales.csv',
          fileName: 'sales.csv',
          mimeType: 'text/csv',
          url: 'https://files.example.test/api/projects/p1/knowledge-files/f2',
        })}
        onClose={jest.fn()}
      />,
    );

    expect(await screen.findByTestId('tabular-grid')).toBeTruthy();
    expect(screen.getByText('North')).toBeTruthy();
  });

  it('shares the file under its own name', async () => {
    mockDownloadGeneratedFile.mockResolvedValue('file:///exports/bundle.zip');
    const zip = source({
      title: 'bundle.zip',
      fileName: 'bundle.zip',
      mimeType: 'application/zip',
      url: 'https://files.example.test/api/files/zip-1',
    });
    render(<FileViewerScreen source={zip} onClose={jest.fn()} />);

    expect(screen.getByTestId('file-viewer-unsupported')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('file-viewer-share'));
    });

    expect(mockDownloadGeneratedFile).toHaveBeenCalledWith(zip.url, 'bundle.zip');
    expect(mockShareFile).toHaveBeenCalledWith('file:///exports/bundle.zip');
  });

  it('reads an on-device file in place without fetching it', async () => {
    mockReadAsStringAsync.mockResolvedValue('local text');
    render(
      <FileViewerScreen
        source={source({
          fileName: 'a.txt',
          title: 'a.txt',
          mimeType: 'text/plain',
          url: 'file:///cache/a.txt',
        })}
        onClose={jest.fn()}
      />,
    );

    expect(await screen.findByText('local text')).toBeTruthy();
    expect(mockDownloadGeneratedFile).not.toHaveBeenCalled();
  });

  it('closes from the close control', () => {
    const onClose = jest.fn();
    mockDownloadGeneratedFile.mockReturnValue(new Promise(() => undefined));
    render(
      <FileViewerScreen
        source={source({ url: 'https://files.example.test/x' })}
        onClose={onClose}
      />,
    );

    fireEvent.press(screen.getByLabelText('Close file'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('offers a bare 44 point Open chat beside Share only when the file names its chat', () => {
    const onOpenChat = jest.fn();
    mockDownloadGeneratedFile.mockReturnValue(new Promise(() => undefined));
    const { rerender } = render(
      <FileViewerScreen
        source={source({ url: 'https://files.example.test/x' })}
        onClose={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('file-viewer-open-chat')).toBeNull();

    rerender(
      <FileViewerScreen
        source={source({ url: 'https://files.example.test/x' })}
        onClose={jest.fn()}
        onOpenChat={onOpenChat}
      />,
    );
    const openChat = screen.getByTestId('file-viewer-open-chat');
    expect(openChat.props.accessibilityLabel).toBe('Open chat');
    expect(tapTarget(openChat).width).toBeGreaterThanOrEqual(FULL_SCREEN_TOUCH_TARGET);
    expect(tapTarget(openChat).height).toBeGreaterThanOrEqual(FULL_SCREEN_TOUCH_TARGET);
    expect(openChat.props.style).not.toHaveProperty('backgroundColor');
    expect(openChat.props.style).not.toHaveProperty('borderWidth');
    fireEvent.press(openChat);
    expect(onOpenChat).toHaveBeenCalledTimes(1);
  });

  it('closes when a link opens another route under it', () => {
    const listeners: Record<string, () => void> = {};
    const navigation = {
      addListener: jest.fn((event: string, listener: () => void) => {
        listeners[event] = listener;
        return () => delete listeners[event];
      }),
    };
    const onClose = jest.fn();
    mockDownloadGeneratedFile.mockReturnValue(new Promise(() => undefined));
    render(
      <NavigationContext.Provider value={navigation as never}>
        <FileViewerScreen
          source={source({ url: 'https://files.example.test/x' })}
          onClose={onClose}
        />
      </NavigationContext.Provider>,
    );

    act(() => listeners.blur?.());

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
