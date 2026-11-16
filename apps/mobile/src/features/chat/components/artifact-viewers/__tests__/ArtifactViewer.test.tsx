/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock('@/lib/mmkv', () => ({
  rehydrateWhenMmkvReady: jest.fn(),
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));
const mockViewerFileCopy = jest.fn((..._args: unknown[]) => new Promise<string>(() => {}));
const mockFileBytes = jest.fn();
jest.mock('@/services/fileCreation', () => ({
  downloadGeneratedFile: jest.fn(() => new Promise(() => {})),
  viewerFileCopy: (...args: unknown[]) => mockViewerFileCopy(...args),
  exportSourceFile: jest.fn(),
  shareFile: jest.fn(),
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
let mockImageStatus = 'ready';
jest.mock('@/src/features/image/hooks/useGeneratedImageSource', () => ({
  useGeneratedImageSource: (path: string) => ({
    source: path ? { uri: `https://files.example.test${path}` } : null,
    status: path ? mockImageStatus : 'invalid',
  }),
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

import 'react-native-gesture-handler/jestSetup';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { Text } from 'react-native';
import { strToU8, zipSync } from 'fflate';
import { buildQuizFollowUp, parseQuiz } from '@agiworkforce/unified-chat/study-set';
import { API_URL } from '@/lib/constants';
import { ArtifactViewer } from '../ArtifactViewer';
import { artifactViewerKind } from '../viewerKind';

const BASE = API_URL.replace(/\/+$/, '');
const ASSET = '0b9c2f4e-7a1d-4c3b-9e8f-1a2b3c4d5e6f';

describe('ArtifactViewer', () => {
  it('shows a stored picture full size, zoomable and named only for the screen reader', () => {
    render(
      <ArtifactViewer
        source={{
          origin: 'file',
          title: 'Revenue chart',
          fileName: 'chart.png',
          mimeType: 'image/png',
          url: `${BASE}/api/files/${ASSET}`,
        }}
      />,
    );

    expect(screen.getByTestId('artifact-viewer-image')).toBeTruthy();
    expect(
      within(screen.getByTestId('artifact-viewer-image-frame')).getByTestId('stored-image'),
    ).toBeTruthy();
    expect(screen.getByLabelText('chart.png')).toBeTruthy();
    expect(screen.queryByText('chart.png')).toBeNull();
  });

  it('keeps saying that a stored picture is unavailable instead of zooming nothing', () => {
    mockImageStatus = 'error';
    try {
      render(
        <ArtifactViewer
          source={{
            origin: 'file',
            title: 'Revenue chart',
            fileName: 'chart.png',
            mimeType: 'image/png',
            url: `${BASE}/api/files/${ASSET}`,
          }}
        />,
      );

      expect(screen.getByLabelText('chart.png, image unavailable')).toBeTruthy();
    } finally {
      mockImageStatus = 'ready';
    }
  });

  it('draws a CSV artifact written in the answer as the grid', () => {
    render(
      <ArtifactViewer
        source={{ origin: 'inline', title: 'Sales', content: 'a,b\n1,2', language: 'csv' }}
      />,
    );

    expect(screen.getByTestId('tabular-grid')).toBeTruthy();
  });

  it('opens a PDF in the document view', () => {
    render(
      <ArtifactViewer
        source={{
          origin: 'file',
          title: 'Report',
          fileName: 'report.pdf',
          mimeType: 'application/pdf',
          url: `${BASE}/api/files/${ASSET}`,
        }}
      />,
    );

    expect(screen.getByTestId('document-file-loading')).toBeTruthy();
  });

  it('keeps a Word document in the document view', () => {
    render(
      <ArtifactViewer
        source={{
          origin: 'file',
          title: 'Letter',
          fileName: 'letter.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          url: `${BASE}/api/files/${ASSET}`,
        }}
      />,
    );

    expect(screen.getByTestId('document-file-loading')).toBeTruthy();
    expect(screen.queryByTestId('workbook-file-loading')).toBeNull();
  });

  it('opens a workbook from a card with one tab per sheet', async () => {
    const sheet = (value: string) =>
      strToU8(
        `<worksheet><sheetData><row><c t="inlineStr"><is><t>${value}</t></is></c></row></sheetData></worksheet>`,
      );
    mockViewerFileCopy.mockResolvedValue('file:///cache/file-views/report.xlsx');
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
      <ArtifactViewer
        source={{
          origin: 'file',
          title: 'report.xlsx',
          fileName: 'report.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          url: `${BASE}/api/files/${ASSET}`,
        }}
      />,
    );

    expect(await screen.findByTestId('tabular-sheet-tabs')).toBeTruthy();
    expect(screen.queryByTestId('document-file-loading')).toBeNull();
    fireEvent.press(screen.getByTestId('tabular-sheet-tab-1'));
    expect(screen.getByText('Lima')).toBeTruthy();
  });

  it('draws nothing for a picture on another site or a type it has no viewer for', () => {
    const { toJSON, rerender } = render(
      <ArtifactViewer
        source={{
          origin: 'file',
          title: 'Remote',
          fileName: 'remote.png',
          mimeType: 'image/png',
          url: 'https://images.example.test/remote.png',
        }}
      />,
    );
    expect(toJSON()).toBeNull();

    rerender(
      <ArtifactViewer
        source={{
          origin: 'file',
          title: 'Bundle',
          fileName: 'bundle.zip',
          mimeType: 'application/zip',
          url: `${BASE}/api/files/${ASSET}`,
        }}
      />,
    );
    expect(toJSON()).toBeNull();
  });

  describe('a study document', () => {
    const quizJson = JSON.stringify({
      title: 'Cells',
      questions: [
        {
          type: 'multiple_choice',
          question: 'Which organelle makes ATP?',
          options: ['Nucleus', 'Mitochondrion'],
          answer: 1,
          explanation: 'Mitochondria run cellular respiration.',
        },
      ],
    });
    const content = ['<!-- @artifact -->', '# Cells practice', '', '~~~quiz', quizJson, '~~~'].join(
      '\n',
    );
    const source = {
      origin: 'inline' as const,
      title: 'Cells practice',
      content,
      language: 'markdown',
    };
    const renderMarkdown = (text: string) => <Text>{text}</Text>;

    it('is drawn as the interactive quiz, never as its source', () => {
      expect(artifactViewerKind(source)).toBe('study');
      render(<ArtifactViewer source={source} renderMarkdown={renderMarkdown} />);

      expect(screen.getByTestId('artifact-viewer-study')).toBeTruthy();
      expect(screen.getByText('Which organelle makes ATP?')).toBeTruthy();
      expect(screen.queryByText(/~~~quiz/)).toBeNull();
      expect(screen.queryByText(/<!-- @artifact -->/)).toBeNull();
      expect(screen.queryByText('Mitochondria run cellular respiration.')).toBeNull();
    });

    it('hands the follow-up prompt to the caller once the quiz is answered', () => {
      const onAsk = jest.fn();
      render(<ArtifactViewer source={source} renderMarkdown={renderMarkdown} onAsk={onAsk} />);

      fireEvent.press(screen.getByTestId('quiz-option-0'));
      fireEvent.press(screen.getByTestId('quiz-check'));
      expect(screen.getByText('Mitochondria run cellular respiration.')).toBeTruthy();
      fireEvent.press(screen.getByTestId('quiz-finish'));
      fireEvent.press(screen.getByTestId('quiz-follow-up'));

      const quiz = parseQuiz(quizJson)!;
      expect(onAsk).toHaveBeenCalledTimes(1);
      expect(onAsk).toHaveBeenCalledWith(
        buildQuizFollowUp(quiz, [{ choice: 0, typed: '', submitted: true, correct: false }]),
      );
    });

    it('draws nothing without a Markdown renderer for its prose', () => {
      const { toJSON } = render(<ArtifactViewer source={source} />);
      expect(toJSON()).toBeNull();
    });
  });
});
