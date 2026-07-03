/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Tests for ReportFlagButton — the per-turn "Report this response" flow
 * (Google Play GenAI policy requirement).
 *
 * Regression coverage, found via live simulator testing:
 *   1. The category Pressables had no accessibilityLabel — undiscoverable by
 *      accessibility-tree tooling despite having visible child text.
 *   2. They also used accessibilityRole="radio", which (confirmed live) does
 *      not map to a tappable iOS accessibility trait the way "button" does —
 *      the row existed in the accessibility tree but could not be activated.
 *      Every other single-select row already shipped in this codebase (e.g.
 *      the Accent Color picker) uses role="button" + accessibilityState.selected
 *      for exactly this reason; this component was the one inconsistent case.
 * Both are fixed: explicit accessibilityLabel + role="button".
 */
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

const mockSaveContentReport = jest.fn().mockResolvedValue({ id: 'rpt_1' });
jest.mock('@/services/contentReport', () => ({
  saveContentReport: (...args: unknown[]) => mockSaveContentReport(...args),
}));

import { ReportFlagButton } from '@/src/features/chat/components/ReportFlagButton';

describe('ReportFlagButton', () => {
  beforeEach(() => {
    mockSaveContentReport.mockClear();
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

    // Regression guard: each category must be discoverable by its own
    // accessibilityLabel, not merely by rendered child text.
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
    expect(getByText('Select the reason that best describes the issue.')).toBeTruthy();
  });

  it('exposes the email opt-in checkbox with an accessibility label', () => {
    const { getByLabelText } = renderButton();
    fireEvent.press(getByLabelText('Report this response'));

    expect(getByLabelText('Send report to support team via email')).toBeTruthy();
  });

  it('disables Submit until a category is selected, then submits the chosen category', async () => {
    const { getByLabelText } = renderButton();
    fireEvent.press(getByLabelText('Report this response'));

    const submitButton = getByLabelText('Submit Report');
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

  it('shows a thank-you confirmation after a successful submission', async () => {
    const { getByLabelText, getByText } = renderButton();
    fireEvent.press(getByLabelText('Report this response'));
    fireEvent.press(getByLabelText('Harmful or dangerous'));
    fireEvent.press(getByLabelText('Submit Report'));

    await waitFor(() => expect(getByText('Thank you for your report')).toBeTruthy());
  });
});
