/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  return new Proxy(
    {},
    {
      get: (_target, name) => {
        if (name === '__esModule') return true;
        return (props: Record<string, unknown>) => (
          <View testID={`icon-${String(name)}`} {...props} />
        );
      },
    },
  );
});

jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: View };
});

jest.mock('../src/ui/theme', () => ({
  ...jest.requireActual('../src/ui/theme/tokens'),
  useThemeColors: () => ({
    surfaceBase: '#111',
    surfaceOverlay: '#222',
    surfaceElevated: '#1a1a1a',
    border: '#333',
    textPrimary: '#fff',
    textSecondary: '#ccc',
    textMuted: '#888',
    agentActive: '#1e90ff',
    agentError: '#f87171',
    progressTrack: '#333',
    warningSurface: '#332200',
    warningBorder: '#664400',
  }),
}));

jest.mock('@/services/api', () => ({ api: { uploadFile: jest.fn() } }));

let mockViewer: { imageUrl: string | null; visible: boolean; onClose: () => void } | null = null;
jest.mock('../src/features/chat/components/ImageFullScreen', () => ({
  ImageFullScreen: (props: { imageUrl: string | null; visible: boolean; onClose: () => void }) => {
    mockViewer = props;
    return null;
  },
}));

import {
  AttachmentPreview,
  type Attachment,
} from '../src/features/chat/components/AttachmentPreview';

const PHOTO: Attachment = {
  id: 'photo-1',
  uri: 'file:///cache/ImagePicker/1111.jpg',
  mimeType: 'image/jpeg',
  fileName: 'IMG_0001.jpg',
  fileSize: 2048,
};

const REPORT: Attachment = {
  id: 'doc-1',
  uri: 'file:///cache/report.pdf',
  mimeType: 'application/pdf',
  fileName: 'quarterly-report.pdf',
  fileSize: 4096,
};

beforeEach(() => {
  mockViewer = null;
});

describe('a staged picture', () => {
  it('opens full screen on tap and closes back to the composer', () => {
    const { getByTestId } = render(
      <AttachmentPreview attachments={[PHOTO]} onRemove={jest.fn()} />,
    );
    expect(mockViewer?.visible).toBe(false);

    fireEvent.press(getByTestId(`attachment-view-${PHOTO.id}`));
    expect(mockViewer).toMatchObject({ imageUrl: PHOTO.uri, visible: true });

    act(() => mockViewer!.onClose());
    expect(mockViewer).toMatchObject({ imageUrl: null, visible: false });
  });

  it('a picture the phone no longer has does not open and says so', () => {
    const { getByTestId, getByText } = render(
      <AttachmentPreview attachments={[{ ...PHOTO, unavailable: true }]} onRemove={jest.fn()} />,
    );

    fireEvent.press(getByTestId(`attachment-view-${PHOTO.id}`));

    expect(mockViewer?.visible).toBe(false);
    expect(getByText('No longer available')).toBeTruthy();
    expect(getByTestId(`attachment-remove-${PHOTO.id}`)).toBeTruthy();
  });

  it('a missing file can still be removed', () => {
    const onRemove = jest.fn();
    const { getByTestId } = render(
      <AttachmentPreview attachments={[{ ...REPORT, unavailable: true }]} onRemove={onRemove} />,
    );

    fireEvent.press(getByTestId(`attachment-remove-${REPORT.id}`));

    expect(onRemove).toHaveBeenCalledWith(REPORT.id);
  });
});

describe('a staged file', () => {
  it('names its kind and size the way the web composer does', () => {
    const { getByText, getByLabelText } = render(
      <AttachmentPreview attachments={[REPORT]} onRemove={jest.fn()} />,
    );

    expect(getByText('PDF · 4 KB')).toBeTruthy();
    expect(getByLabelText('quarterly-report.pdf, PDF, 4 KB')).toBeTruthy();
  });

  it.each([
    [
      'data.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Spreadsheet',
    ],
    ['main.ts', 'text/typescript', 'Code'],
    [
      'deck.pptx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'Presentation',
    ],
    [
      'letter.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Document',
    ],
    ['notes.txt', 'text/plain', 'Text'],
  ])('%s (%s) reads as %s', (fileName, mimeType, kind) => {
    const { getByText } = render(
      <AttachmentPreview
        attachments={[{ ...REPORT, fileName, mimeType, fileSize: undefined }]}
        onRemove={jest.fn()}
      />,
    );

    expect(getByText(kind)).toBeTruthy();
  });
});
