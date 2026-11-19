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
    dangerSurface: '#330000',
    dangerBorder: '#660000',
    scrim: 'rgba(0,0,0,0.5)',
    white: '#ffffff',
    black: '#000000',
  }),
}));

jest.mock('@/services/api', () => ({ api: { uploadFile: jest.fn() } }));

jest.mock('../src/features/chat/components/ImageFullScreen', () => ({
  ImageFullScreen: () => null,
}));

const mockImageNames: Array<string | undefined> = [];
jest.mock('../src/features/image/components/AuthorizedImage', () => {
  const { View } = require('react-native');
  return {
    AuthorizedImage: (props: { name?: string }) => {
      mockImageNames.push(props.name);
      return <View testID="authorized-image" />;
    },
  };
});

import {
  AttachmentPreview,
  type Attachment,
} from '../src/features/chat/components/AttachmentPreview';
import { useUploadLifecycleStore } from '../src/features/chat/upload/uploadLifecycle';

function photo(index: number): Attachment {
  return {
    id: `photo-${index}`,
    uri: `file:///cache/${index}.jpg`,
    mimeType: 'image/jpeg',
    fileName: `IMG_000${index}.jpg`,
    fileSize: 2048,
  };
}

const REPORT: Attachment = {
  id: 'doc-1',
  uri: 'file:///cache/report.pdf',
  mimeType: 'application/pdf',
  fileName: 'report.pdf',
  fileSize: 4096,
};

function failUpload(id: string) {
  const store = useUploadLifecycleStore.getState();
  store.begin(id);
  store.settle(id, 'failed', 'Could not upload this file.');
}

beforeEach(() => {
  useUploadLifecycleStore.getState().reset();
  mockImageNames.length = 0;
});

describe('a file that did not go up at send', () => {
  it('shows one tappable Retry and no Not sent overlay on top of it', () => {
    failUpload(REPORT.id);
    const onRetryUpload = jest.fn();
    const { getByTestId, queryByText, queryByTestId } = render(
      <AttachmentPreview
        attachments={[{ ...REPORT, sendFailed: true }]}
        onRemove={jest.fn()}
        onRetryUpload={onRetryUpload}
      />,
    );

    expect(queryByText('Not sent')).toBeNull();
    expect(queryByTestId(`attachment-not-sent-${REPORT.id}`)).toBeNull();

    const retry = getByTestId(`attachment-retry-${REPORT.id}`);
    expect(retry.props.accessibilityLabel).toBe(
      'Not sent. Upload failed. Retry uploading report.pdf',
    );
    fireEvent.press(retry);
    expect(onRetryUpload).toHaveBeenCalledWith(REPORT.id);
  });

  it('says Not sent without a Retry when nothing can be resumed', () => {
    const { getByText, queryByTestId, getByTestId } = render(
      <AttachmentPreview
        attachments={[{ ...REPORT, sendFailed: true }]}
        onRemove={jest.fn()}
        onRetryUpload={jest.fn()}
      />,
    );

    expect(getByText('Not sent')).toBeTruthy();
    expect(getByTestId(`attachment-not-sent-${REPORT.id}`).props.pointerEvents).toBe('none');
    expect(queryByTestId(`attachment-retry-${REPORT.id}`)).toBeNull();
  });

  it('keeps Remove reachable beside the Retry', () => {
    failUpload(REPORT.id);
    const onRemove = jest.fn();
    const { getByTestId } = render(
      <AttachmentPreview
        attachments={[{ ...REPORT, sendFailed: true }]}
        onRemove={onRemove}
        onRetryUpload={jest.fn()}
      />,
    );

    fireEvent.press(getByTestId(`attachment-remove-${REPORT.id}`));
    expect(onRemove).toHaveBeenCalledWith(REPORT.id);
  });
});

describe('a file the server is confirming', () => {
  it('reads Verifying once the bar is full', () => {
    const store = useUploadLifecycleStore.getState();
    store.begin(REPORT.id);
    store.reportProgress(REPORT.id, 40, 100);
    const view = render(<AttachmentPreview attachments={[REPORT]} onRemove={jest.fn()} />);
    expect(view.queryByText('Verifying')).toBeNull();

    act(() => store.reportProgress(REPORT.id, 100, 100));

    expect(view.getByText('Verifying')).toBeTruthy();
    expect(view.getByTestId(`attachment-progress-${REPORT.id}`).props.accessibilityLabel).toBe(
      'report.pdf, Verifying',
    );
    expect(view.getByTestId(`attachment-cancel-${REPORT.id}`)).toBeTruthy();
  });
});

describe('numbering pictures in send order', () => {
  it('numbers three pictures 1, 2, 3 in image mode and names the one being edited', () => {
    const { getByTestId, getByLabelText } = render(
      <AttachmentPreview
        attachments={[photo(1), photo(2), photo(3)]}
        onRemove={jest.fn()}
        numberImages
      />,
    );

    expect(getByTestId('attachment-number-photo-1')).toBeTruthy();
    expect(getByTestId('attachment-number-photo-3')).toBeTruthy();
    expect(getByLabelText('IMG_0001.jpg, 2 KB, image 1 of 3, the picture to edit')).toBeTruthy();
    expect(getByLabelText('IMG_0002.jpg, 2 KB, image 2 of 3')).toBeTruthy();
    expect(getByLabelText('IMG_0003.jpg, 2 KB, image 3 of 3')).toBeTruthy();
  });

  it('counts only pictures and leaves files unnumbered', () => {
    const { getByText, queryByTestId } = render(
      <AttachmentPreview
        attachments={[REPORT, photo(1), photo(2)]}
        onRemove={jest.fn()}
        numberImages
      />,
    );

    expect(getByText('1')).toBeTruthy();
    expect(getByText('2')).toBeTruthy();
    expect(queryByTestId(`attachment-number-${REPORT.id}`)).toBeNull();
  });

  it('numbers nothing for one picture or outside image mode', () => {
    const single = render(
      <AttachmentPreview attachments={[photo(1)]} onRemove={jest.fn()} numberImages />,
    );
    expect(single.queryByTestId('attachment-number-photo-1')).toBeNull();

    const text = render(
      <AttachmentPreview attachments={[photo(1), photo(2)]} onRemove={jest.fn()} />,
    );
    expect(text.queryByTestId('attachment-number-photo-1')).toBeNull();
  });
});

describe('the picture tile', () => {
  it('hands the file name to the image so a picture that fails to load is still named', () => {
    render(<AttachmentPreview attachments={[photo(1)]} onRemove={jest.fn()} />);

    expect(mockImageNames).toContain('IMG_0001.jpg');
  });

  it('shows no count badge beside several attachments', () => {
    const { queryByText } = render(
      <AttachmentPreview attachments={[photo(1), photo(2), REPORT]} onRemove={jest.fn()} />,
    );

    expect(queryByText('3')).toBeNull();
  });
});

describe('document tiles', () => {
  it.each([
    [
      'letter.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'icon-FileType',
      'Document',
    ],
    [
      'deck.pptx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'icon-Presentation',
      'Presentation',
    ],
  ])('%s has its own icon and type word', (fileName, mimeType, icon, kind) => {
    const { getByTestId, getByText } = render(
      <AttachmentPreview
        attachments={[{ ...REPORT, fileName, mimeType, fileSize: 1536 }]}
        onRemove={jest.fn()}
      />,
    );

    expect(getByTestId(icon)).toBeTruthy();
    expect(getByText(`${kind} · 2 KB`)).toBeTruthy();
  });
});
