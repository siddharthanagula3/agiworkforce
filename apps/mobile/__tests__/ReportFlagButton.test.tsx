/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('@/src/ui/theme', () => {
  const actual = jest.requireActual('@/src/ui/theme/tokens');
  return { ...actual, useThemeColors: () => actual.lightColors };
});

jest.mock('@/components/ui/Text', () => {
  const RN = require('react-native');
  const Text = (props: Record<string, unknown>) => <RN.Text {...props} />;
  Text.displayName = 'Text';
  return { Text };
});

jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  return { Flag: (props: Record<string, unknown>) => <RN.View {...props} /> };
});

const mockReport = {
  id: 'rpt_1',
  messageId: 'msg-1',
  conversationId: 'conv-1',
  contentExcerpt: 'Some assistant response text',
  category: 'inaccurate',
  userNote: '',
  createdAt: '2026-08-01T00:00:00.000Z',
  emailHandoffOpened: false,
};
const mockSaveContentReport = jest
  .fn()
  .mockResolvedValue({ report: mockReport, delivery: { kind: 'stored-on-device' } });
const mockOpenSupportEmail = jest.fn().mockResolvedValue(true);
const mockSendStoredContentReport = jest.fn();
const mockResumeQueuedContentReports = jest.fn();
jest.mock('@/services/contentReport', () => ({
  saveContentReport: (...args: unknown[]) => mockSaveContentReport(...args),
  openSupportEmail: (...args: unknown[]) => mockOpenSupportEmail(...args),
  sendStoredContentReport: (...args: unknown[]) => mockSendStoredContentReport(...args),
  resumeQueuedContentReports: () => mockResumeQueuedContentReports(),
}));

import { ReportFlagButton } from '@/src/features/chat/components/ReportFlagButton';

describe('ReportFlagButton', () => {
  beforeEach(() => {
    mockSaveContentReport.mockClear();
    mockOpenSupportEmail.mockClear();
    mockSendStoredContentReport.mockReset();
    mockSaveContentReport.mockResolvedValue({
      report: mockReport,
      delivery: { kind: 'stored-on-device' },
    });
    mockOpenSupportEmail.mockResolvedValue(true);
  });

  const renderButton = () =>
    render(
      <ReportFlagButton
        messageId="msg-1"
        conversationId="conv-1"
        contentExcerpt="Some assistant response text"
      />,
    );

  it('exposes each report category as an accessible radio with its own label', () => {
    const { getByLabelText, getByText } = renderButton();
    fireEvent.press(getByLabelText('Report this response'));

    for (const label of [
      'Harmful or dangerous',
      'Inaccurate or misleading',
      'Offensive or hateful',
      'Misinformation',
      'Privacy concern',
      'Other',
    ]) {
      expect(getByLabelText(label)).toBeTruthy();
    }
    expect(
      getByText(
        'Reports are saved on this device and sent to the AGI safety team for review when you’re online.',
      ),
    ).toBeTruthy();
  });

  it('exposes the email opt-in checkbox with an accessibility label', () => {
    const { getByLabelText } = renderButton();
    fireEvent.press(getByLabelText('Report this response'));

    expect(getByLabelText('Email this report to support')).toBeTruthy();
  });

  it('says up front where the report goes, on device, and to the safety team when connected', () => {
    const { getByLabelText, getByText } = renderButton();
    fireEvent.press(getByLabelText('Report this response'));

    expect(getByText(/saved on this device/i)).toBeTruthy();
    expect(getByText(/sent to the AGI safety team for review/i)).toBeTruthy();
  });

  it('disables Save until a category is selected, then saves the chosen category', async () => {
    const { getByLabelText } = renderButton();
    fireEvent.press(getByLabelText('Report this response'));

    const submitButton = getByLabelText('Save report');
    expect(submitButton.props.accessibilityState?.disabled).toBe(true);

    fireEvent.press(getByLabelText('Inaccurate or misleading'));
    expect(submitButton.props.accessibilityState?.disabled).toBe(false);

    fireEvent.press(submitButton);

    await waitFor(() => expect(mockSaveContentReport).toHaveBeenCalledTimes(1));
    expect(mockSaveContentReport).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: 'msg-1',
        conversationId: 'conv-1',
        category: 'inaccurate',
        sendEmail: false,
      }),
    );
  });

  it('confirms what actually happened, stored locally, not transmitted', async () => {
    const { getByLabelText, getByText, queryByText } = renderButton();
    fireEvent.press(getByLabelText('Report this response'));
    fireEvent.press(getByLabelText('Harmful or dangerous'));
    fireEvent.press(getByLabelText('Save report'));

    await waitFor(() => expect(getByText('Send this report to AGI?')).toBeTruthy());
    expect(getByText(/nothing was sent/i)).toBeTruthy();
    expect(queryByText('Thank you for your report')).toBeNull();
    expect(queryByText(/we (will )?(review|received)/i)).toBeNull();
  });

  it('keeps local storage diagnostics private when a report cannot be saved', async () => {
    mockSaveContentReport.mockRejectedValue(new Error('MMKV private storage path'));
    const { getByLabelText, getByText, queryByText } = renderButton();
    fireEvent.press(getByLabelText('Report this response'));
    fireEvent.press(getByLabelText('Harmful or dangerous'));
    fireEvent.press(getByLabelText('Save report'));

    await waitFor(() =>
      expect(
        getByText('Report could not be saved on this device. Free up space and try again.'),
      ).toBeTruthy(),
    );
    expect(queryByText(/MMKV private/)).toBeNull();
    expect(queryByText('Send this report to AGI?')).toBeNull();
  });

  it('offers the email hand-off from the saved state and reports its result', async () => {
    const { getByLabelText, getByTestId, getByText } = renderButton();
    fireEvent.press(getByLabelText('Report this response'));
    fireEvent.press(getByLabelText('Harmful or dangerous'));
    fireEvent.press(getByLabelText('Save report'));

    await waitFor(() => expect(getByText('Send this report to AGI?')).toBeTruthy());
    fireEvent.press(getByTestId('report-email-handoff-btn'));

    await waitFor(() => expect(mockOpenSupportEmail).toHaveBeenCalledWith(mockReport));
    await waitFor(() => expect(getByText(/Send the email in your mail app/i)).toBeTruthy());
  });

  it('does not claim a hand-off when no mail client could be opened', async () => {
    mockOpenSupportEmail.mockResolvedValue(false);

    const { getByLabelText, getByTestId, getByText } = renderButton();
    fireEvent.press(getByLabelText('Report this response'));
    fireEvent.press(getByLabelText('Harmful or dangerous'));
    fireEvent.press(getByLabelText('Save report'));

    await waitFor(() => expect(getByText('Send this report to AGI?')).toBeTruthy());
    fireEvent.press(getByTestId('report-email-handoff-btn'));

    await waitFor(() => expect(getByText(/No mail app is set up/i)).toBeTruthy());
  });

  it('asks before sending a report that stayed on the device, and sends it on Send', async () => {
    mockSendStoredContentReport.mockResolvedValue({ kind: 'queued-for-upload' });
    const { getByLabelText, getByText } = renderButton();
    fireEvent.press(getByLabelText('Report this response'));
    fireEvent.press(getByLabelText('Harmful or dangerous'));
    fireEvent.press(getByLabelText('Save report'));

    await waitFor(() => expect(getByText('Send this report to AGI?')).toBeTruthy());
    expect(mockSendStoredContentReport).not.toHaveBeenCalled();
    fireEvent.press(getByLabelText('Send'));

    await waitFor(() => expect(mockSendStoredContentReport).toHaveBeenCalledWith('rpt_1'));
    await waitFor(() => expect(getByText('Report queued')).toBeTruthy());
  });

  it('sends nothing when the user cancels the send question', async () => {
    const { getByLabelText, getByText } = renderButton();
    fireEvent.press(getByLabelText('Report this response'));
    fireEvent.press(getByLabelText('Harmful or dangerous'));
    fireEvent.press(getByLabelText('Save report'));

    await waitFor(() => expect(getByText('Send this report to AGI?')).toBeTruthy());
    fireEvent.press(getByLabelText('Cancel'));

    expect(mockSendStoredContentReport).not.toHaveBeenCalled();
  });

  it('does not ask again once the server accepted the report', async () => {
    mockSaveContentReport.mockResolvedValue({
      report: mockReport,
      delivery: { kind: 'submitted-to-server' },
    });
    const { getByLabelText, getByText, queryByLabelText } = renderButton();
    fireEvent.press(getByLabelText('Report this response'));
    fireEvent.press(getByLabelText('Harmful or dangerous'));
    fireEvent.press(getByLabelText('Save report'));

    await waitFor(() => expect(getByText('Report submitted for review')).toBeTruthy());
    expect(queryByLabelText('Send')).toBeNull();
  });

  it('passes the media reference through to the saved report', async () => {
    const asset = { kind: 'image' as const, url: 'https://cdn.example.com/img.png' };
    const { getByLabelText } = render(
      <ReportFlagButton
        messageId="msg-2"
        conversationId="conv-2"
        contentExcerpt=""
        asset={asset}
      />,
    );
    fireEvent.press(getByLabelText('Report this image'));
    fireEvent.press(getByLabelText('Offensive or hateful'));
    fireEvent.press(getByLabelText('Save report'));

    await waitFor(() =>
      expect(mockSaveContentReport).toHaveBeenCalledWith(
        expect.objectContaining({ messageId: 'msg-2', asset }),
      ),
    );
  });

  it('resumes queued reports from earlier sessions', () => {
    renderButton();
    expect(mockResumeQueuedContentReports).toHaveBeenCalled();
  });
});
