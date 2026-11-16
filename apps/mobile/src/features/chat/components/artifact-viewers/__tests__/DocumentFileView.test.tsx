/* eslint-disable @typescript-eslint/no-require-imports */
const mockDownloadGeneratedFile = jest.fn();
const mockShareFile = jest.fn().mockResolvedValue(undefined);

jest.mock('@/services/fileCreation', () => ({
  downloadGeneratedFile: (...args: unknown[]) => mockDownloadGeneratedFile(...args),
  viewerFileCopy: (...args: unknown[]) => mockDownloadGeneratedFile(...args),
  shareFile: (uri: string) => mockShareFile(uri),
  exportSourceFile: jest.fn(),
}));
let mockViewerHtml: string | null = null;
jest.mock('../pdfViewerHtml', () => ({
  get PDF_VIEWER_HTML() {
    return mockViewerHtml;
  },
}));
const mockPdfFileView = jest.fn();
jest.mock('../PdfFileView', () => {
  const RN = require('react-native');
  return {
    PdfFileView: (props: Record<string, unknown>) => {
      mockPdfFileView(props);
      return <RN.View testID="pdf-file-view" />;
    },
  };
});
jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: () => ({ ownerId: 'user-1', epoch: 1 }),
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

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { DocumentFileView, documentFrameUri, isOwnDocumentNavigation } from '../DocumentFileView';
import type { FileViewerSource } from '../viewerKind';

let sequence = 0;
function pdf(): FileViewerSource {
  sequence += 1;
  return {
    title: 'report.pdf',
    fileName: 'report.pdf',
    mimeType: 'application/pdf',
    url: `https://files.example.test/api/files/doc-${sequence}`,
  };
}

const LOCAL = 'file:///exports/report.pdf';

describe('DocumentFileView', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    mockViewerHtml = null;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
  });

  it('downloads the file with its name and draws it with scripts off', async () => {
    mockDownloadGeneratedFile.mockResolvedValue(LOCAL);
    const source = pdf();
    render(<DocumentFileView source={source} page={12} />);

    expect(screen.getByTestId('document-file-loading')).toBeTruthy();
    const frame = await screen.findByTestId('document-file-frame');

    expect(mockDownloadGeneratedFile).toHaveBeenCalledWith(source.url, 'report.pdf');
    expect(frame.props.source).toEqual({ uri: `${LOCAL}#page=12` });
    expect(frame.props.javaScriptEnabled).toBe(false);
    expect(frame.props.allowingReadAccessToURL).toBe(LOCAL);
    expect(frame.props.onShouldStartLoadWithRequest({ url: `${LOCAL}#page=3` })).toBe(true);
    expect(frame.props.onShouldStartLoadWithRequest({ url: 'https://evil.example' })).toBe(false);
    expect(frame.props.onShouldStartLoadWithRequest({ url: 'file:///etc/passwd' })).toBe(false);
  });

  it('offers Retry when the download fails, and opens the file once it works', async () => {
    mockDownloadGeneratedFile.mockRejectedValueOnce(new Error('Download failed (HTTP 500)'));
    mockDownloadGeneratedFile.mockResolvedValueOnce(LOCAL);
    render(<DocumentFileView source={pdf()} />);

    expect(await screen.findByTestId('document-file-failed')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Retry'));
    });

    expect(await screen.findByTestId('document-file-frame')).toBeTruthy();
    expect(mockDownloadGeneratedFile).toHaveBeenCalledTimes(2);
  });

  it('falls back to Retry and Share when the file cannot be drawn', async () => {
    mockDownloadGeneratedFile.mockResolvedValue(LOCAL);
    render(<DocumentFileView source={pdf()} />);

    const frame = await screen.findByTestId('document-file-frame');
    act(() => frame.props.onError());

    expect(screen.getByTestId('document-file-render-failed')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Share report.pdf'));
    });
    expect(mockShareFile).toHaveBeenCalledWith(LOCAL);

    fireEvent.press(screen.getByText('Retry'));
    await waitFor(() => expect(screen.getByTestId('document-file-frame')).toBeTruthy());
  });

  it('hands the file to another app where the system cannot draw it', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    mockDownloadGeneratedFile.mockResolvedValue(LOCAL);
    render(<DocumentFileView source={pdf()} />);

    expect(await screen.findByTestId('document-file-external')).toBeTruthy();
    expect(screen.queryByTestId('document-file-frame')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Share report.pdf'));
    });
    expect(mockShareFile).toHaveBeenCalledWith(LOCAL);
  });

  describe('on Android', () => {
    beforeEach(() => {
      Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
      mockViewerHtml = '<html></html>';
      mockDownloadGeneratedFile.mockResolvedValue(LOCAL);
    });

    it('draws a PDF in the app with the bundled viewer, opened at the page it was given', async () => {
      const source = pdf();
      render(<DocumentFileView source={source} page={4} />);

      expect(await screen.findByTestId('pdf-file-view')).toBeTruthy();
      expect(mockPdfFileView).toHaveBeenCalledWith(
        expect.objectContaining({ uri: LOCAL, fileName: 'report.pdf', page: 4 }),
      );
      expect(screen.queryByTestId('document-file-frame')).toBeNull();
      expect(screen.queryByTestId('document-file-external')).toBeNull();
    });

    it('keeps handing an Office file to another app', async () => {
      render(
        <DocumentFileView
          source={{
            ...pdf(),
            title: 'plan.docx',
            fileName: 'plan.docx',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          }}
        />,
      );

      expect(await screen.findByTestId('document-file-external')).toBeTruthy();
      expect(screen.queryByTestId('pdf-file-view')).toBeNull();
      await act(async () => {
        fireEvent.press(screen.getByLabelText('Share plan.docx'));
      });
      expect(mockShareFile).toHaveBeenCalledWith(LOCAL);
    });

    it('keeps handing a PDF to another app when the viewer is not in the build', async () => {
      mockViewerHtml = null;
      render(<DocumentFileView source={pdf()} />);

      expect(await screen.findByTestId('document-file-external')).toBeTruthy();
      expect(screen.queryByTestId('pdf-file-view')).toBeNull();
    });

    it('offers Retry and Share when the viewer cannot show the PDF, and Retry opens it again', async () => {
      render(<DocumentFileView source={pdf()} />);
      await screen.findByTestId('pdf-file-view');

      act(() => mockPdfFileView.mock.lastCall![0].onFailed('error'));

      expect(screen.getByTestId('document-file-render-failed')).toBeTruthy();
      expect(screen.queryByTestId('pdf-file-view')).toBeNull();
      await act(async () => {
        fireEvent.press(screen.getByLabelText('Share report.pdf'));
      });
      expect(mockShareFile).toHaveBeenCalledWith(LOCAL);

      mockPdfFileView.mockClear();
      fireEvent.press(screen.getByText('Retry'));
      expect(await screen.findByTestId('pdf-file-view')).toBeTruthy();
      expect(mockPdfFileView).toHaveBeenCalled();
    });

    it('says a password protected PDF needs another app', async () => {
      render(<DocumentFileView source={pdf()} />);
      await screen.findByTestId('pdf-file-view');

      act(() => mockPdfFileView.mock.lastCall![0].onFailed('password'));

      expect(
        screen.getByText('It is protected by a password. Share it to open it in another app.'),
      ).toBeTruthy();
    });

    it('says nothing about a password for any other failure', async () => {
      render(<DocumentFileView source={pdf()} />);
      await screen.findByTestId('pdf-file-view');

      act(() => mockPdfFileView.mock.lastCall![0].onFailed('invalid'));

      expect(screen.queryByText(/password/)).toBeNull();
    });
  });

  it('keeps the page fragment and the navigation guard pure', () => {
    expect(documentFrameUri(LOCAL)).toBe(LOCAL);
    expect(documentFrameUri(LOCAL, 0)).toBe(LOCAL);
    expect(isOwnDocumentNavigation(`${LOCAL}#page=2`, LOCAL)).toBe(true);
    expect(isOwnDocumentNavigation(`${LOCAL}.evil`, LOCAL)).toBe(false);
  });
});
