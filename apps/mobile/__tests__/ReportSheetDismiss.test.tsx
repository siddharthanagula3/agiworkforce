/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Modal, ScrollView } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactTestInstance } from 'react-test-renderer';

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

jest.mock(
  'lucide-react-native',
  () => new Proxy({}, { get: () => jest.fn().mockReturnValue(null) }),
);

const mockSaveContentReport = jest.fn();
jest.mock('@/services/contentReport', () => ({
  saveContentReport: (...args: unknown[]) => mockSaveContentReport(...args),
  openSupportEmail: jest.fn().mockResolvedValue(true),
  sendStoredContentReport: jest.fn(),
  resumeQueuedContentReports: jest.fn(),
}));

import { ReportSheet } from '@/src/features/chat/components/ReportFlagButton';

const TARGET = {
  messageId: 'msg-1',
  conversationId: 'conv-1',
  contentExcerpt: 'Some assistant response text',
};

function isInside(node: ReactTestInstance, ancestor: ReactTestInstance): boolean {
  for (let current: ReactTestInstance | null = node.parent; current; current = current.parent) {
    if (current === ancestor) return true;
  }
  return false;
}

function focusablePressables(root: ReactTestInstance): ReactTestInstance[] {
  return root.findAll(
    (node) =>
      typeof node.type === 'string' &&
      typeof node.props.onClick === 'function' &&
      node.props.accessible !== false,
  );
}

describe('ReportSheet dismissal', () => {
  beforeEach(() => {
    mockSaveContentReport.mockReset();
    mockSaveContentReport.mockResolvedValue({
      report: {
        id: 'rpt_1',
        ...TARGET,
        category: 'harmful',
        userNote: '',
        createdAt: '2026-11-14T00:00:00.000Z',
        emailHandoffOpened: false,
        serverAcknowledged: true,
      },
      delivery: { kind: 'submitted-to-server' },
    });
  });

  it('keeps a Close control above the scrolling form, so it shows without scrolling', () => {
    const onClose = jest.fn();
    const screen = render(<ReportSheet visible onClose={onClose} target={TARGET} />);

    const close = screen.getByLabelText('Close');
    const form = screen.UNSAFE_getByType(ScrollView);
    expect(isInside(close, form)).toBe(false);

    fireEvent.press(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps Close on screen after the report is saved', async () => {
    const onClose = jest.fn();
    const screen = render(<ReportSheet visible onClose={onClose} target={TARGET} />);
    fireEvent.press(screen.getByLabelText('Harmful or dangerous'));
    fireEvent.press(screen.getByLabelText('Save report'));

    await waitFor(() => expect(screen.getByText('Report submitted for review')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('is a system sheet that a swipe down dismisses through onRequestClose', () => {
    const onClose = jest.fn();
    const screen = render(<ReportSheet visible onClose={onClose} target={TARGET} />);
    const modal = screen.UNSAFE_getByType(Modal);

    expect(modal.props.presentationStyle).toBe('pageSheet');
    expect(modal.props.allowSwipeDismissal).toBe(true);
    expect(modal.props.transparent).not.toBe(true);

    modal.props.onRequestClose();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('exposes no unlabeled control to assistive technology', () => {
    const screen = render(<ReportSheet visible onClose={jest.fn()} target={TARGET} />);
    const unlabeled = focusablePressables(screen.UNSAFE_getByType(Modal)).filter(
      (node) =>
        !node.props.accessibilityLabel &&
        node.findAll((child) => typeof child.props.children === 'string').length === 0,
    );
    expect(unlabeled.map((node) => node.props.testID ?? node.props.style)).toEqual([]);
  });
});
