/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('@/src/ui/theme', () => {
  const actual = jest.requireActual('@/src/ui/theme/tokens');
  return { ...actual, useThemeColors: () => actual.lightColors };
});

jest.mock('@/components/ui/text', () => {
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
jest.mock('@/services/contentReport', () => ({
  saveContentReport: (...args: unknown[]) => mockSaveContentReport(...args),
  openSupportEmail: (...args: unknown[]) => mockOpenSupportEmail(...args),
}));

import { ReportFlagButton } from '@/src/features/chat/components/ReportFlagButton';

describe('ReportFlagButton', () => {
  beforeEach(() => {
    mockSaveContentReport.mockClear();
    mockOpenSupportEmail.mockClear();
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
    expect(getByText(/Select the reason that best describes the issue/)).toBeTruthy();
  });

  it('exposes the email opt-in checkbox with an accessibility label', () => {
    const { getByLabelText } = renderButton();
    fireEvent.press(getByLabelText('Report this response'));

    expect(getByLabelText('Email this report to support')).toBeTruthy();
  });

  it('says up front where the report goes — on device, and to the safety team when connected', () => {
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

  it('confirms what actually happened — stored locally, not transmitted', async () => {
    const { getByLabelText, getByText, queryByText } = renderButton();
    fireEvent.press(getByLabelText('Report this response'));
    fireEvent.press(getByLabelText('Harmful or dangerous'));
    fireEvent.press(getByLabelText('Save report'));

    await waitFor(() => expect(getByText('Report saved on this device')).toBeTruthy());
    expect(getByText(/nothing was sent/i)).toBeTruthy();
    expect(queryByText('Thank you for your report')).toBeNull();
    expect(queryByText(/we (will )?(review|received)/i)).toBeNull();
  });

  it('offers the email hand-off from the saved state and reports its result', async () => {
    const { getByLabelText, getByTestId, getByText } = renderButton();
    fireEvent.press(getByLabelText('Report this response'));
    fireEvent.press(getByLabelText('Harmful or dangerous'));
    fireEvent.press(getByLabelText('Save report'));

    await waitFor(() => expect(getByText('Report saved on this device')).toBeTruthy());
    fireEvent.press(getByTestId('report-email-handoff-btn'));

    await waitFor(() => expect(mockOpenSupportEmail).toHaveBeenCalledWith(mockReport));
    await waitFor(() => expect(getByText(/Your mail app opened/i)).toBeTruthy());
  });

  it('does not claim a hand-off when no mail client could be opened', async () => {
    mockOpenSupportEmail.mockResolvedValue(false);

    const { getByLabelText, getByTestId, getByText } = renderButton();
    fireEvent.press(getByLabelText('Report this response'));
    fireEvent.press(getByLabelText('Harmful or dangerous'));
    fireEvent.press(getByLabelText('Save report'));

    await waitFor(() => expect(getByText('Report saved on this device')).toBeTruthy());
    fireEvent.press(getByTestId('report-email-handoff-btn'));

    await waitFor(() => expect(getByText(/No mail app is set up/i)).toBeTruthy());
  });
});
