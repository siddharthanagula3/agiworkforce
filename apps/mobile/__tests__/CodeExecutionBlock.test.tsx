/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { Share } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

const mockCopy = jest.fn(async (_text: string) => true);
jest.mock('@/lib/clipboard', () => ({
  copyToClipboard: (text: string) => mockCopy(text),
}));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));
jest.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (select: (state: { hapticsEnabled: boolean }) => unknown) =>
    select({ hapticsEnabled: false }),
}));
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
  const Icon = (props: Record<string, unknown>) => <RN.View {...props} />;
  return new Proxy({}, { get: () => Icon });
});

import {
  CODE_EXECUTION_RUNNING_LABEL,
  CodeExecutionBlock,
} from '@/src/features/chat/components/CodeExecutionBlock';

describe('CodeExecutionBlock', () => {
  afterEach(() => {
    mockCopy.mockClear();
    jest.restoreAllMocks();
  });

  it('renders nothing when the message ran no code', () => {
    const view = render(<CodeExecutionBlock messageId="m1" />);
    expect(view.queryByTestId('code-execution')).toBeNull();
  });

  it('shows a running line while the code executes, before any result exists', () => {
    const view = render(<CodeExecutionBlock messageId="m1" isExecuting />);
    expect(view.getByTestId('code-execution.running')).toBeTruthy();
    expect(view.queryByTestId('code-execution.output')).toBeNull();
    expect(view.getByLabelText(`Code Execution, ${CODE_EXECUTION_RUNNING_LABEL}`)).toBeTruthy();
  });

  it('shows the output of a successful run with no exit code line', () => {
    const view = render(
      <CodeExecutionBlock
        messageId="m1"
        isExecuting={false}
        result={{ stdout: '4\n', stderr: '', returnCode: 0 }}
      />,
    );
    expect(view.queryByTestId('code-execution.running')).toBeNull();
    expect(view.getByText('Output')).toBeTruthy();
    expect(view.getByText('4\n')).toBeTruthy();
    expect(view.queryByTestId('code-execution.stderr')).toBeNull();
    expect(view.queryByTestId('code-execution.exit-code')).toBeNull();
  });

  it('keeps stdout, stderr and a non-zero exit code apart', () => {
    const view = render(
      <CodeExecutionBlock
        messageId="m1"
        result={{ stdout: 'partial', stderr: 'ZeroDivisionError: division by zero', returnCode: 1 }}
      />,
    );
    expect(view.getByText('partial')).toBeTruthy();
    expect(view.getByText('Stderr')).toBeTruthy();
    expect(view.getByText('ZeroDivisionError: division by zero')).toBeTruthy();
    expect(view.getByTestId('code-execution.exit-code').props.children).toBe('Exit code: 1');
    expect(view.getByLabelText('Code Execution, Exit code 1')).toBeTruthy();
  });

  it('collapses and reopens the output from the header', () => {
    const view = render(
      <CodeExecutionBlock messageId="m1" result={{ stdout: '4', stderr: '', returnCode: 0 }} />,
    );
    const header = view.getByLabelText('Code Execution, Finished');
    expect(header.props.accessibilityState).toEqual(expect.objectContaining({ expanded: true }));
    fireEvent.press(header);
    expect(view.queryByTestId('code-execution.output')).toBeNull();
    expect(view.getByLabelText('Code Execution, Finished').props.accessibilityState).toEqual(
      expect.objectContaining({ expanded: false }),
    );
    fireEvent.press(view.getByLabelText('Code Execution, Finished'));
    expect(view.getByTestId('code-execution.output')).toBeTruthy();
  });

  it('draws only the plots the shared image rule accepts, as inline data', () => {
    const view = render(
      <CodeExecutionBlock
        messageId="m1"
        result={{
          stdout: '',
          stderr: '',
          returnCode: 0,
          images: [
            { mediaType: 'image/png', data: 'iVBORw0K\nGgo=' },
            { mediaType: 'image/svg+xml', data: 'PHN2Zz4=' },
            { mediaType: 'image/jpeg', data: 'not base64!' },
          ],
        }}
      />,
    );
    expect(view.getByText('Plot 1')).toBeTruthy();
    expect(view.queryByText('Plot 2')).toBeNull();
    const plot = view.getByLabelText('Code execution output 1');
    expect(plot.props.source).toEqual({ uri: 'data:image/png;base64,iVBORw0KGgo=' });
    expect(view.queryByLabelText('Code execution output 2')).toBeNull();
    const header = view.getByLabelText('Code Execution, Finished');
    fireEvent.press(header);
    expect(view.queryByLabelText('Code execution output 1')).toBeNull();
  });

  it('copies and shares the exact stdout and stderr', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    const view = render(
      <CodeExecutionBlock
        messageId="m1"
        result={{ stdout: 'line one\n  line two', stderr: 'warning: slow', returnCode: 0 }}
      />,
    );
    await act(async () => {
      fireEvent.press(view.getByLabelText('Copy output'));
    });
    expect(mockCopy).toHaveBeenLastCalledWith('line one\n  line two');
    await act(async () => {
      fireEvent.press(view.getByLabelText('Copy error'));
    });
    expect(mockCopy).toHaveBeenLastCalledWith('warning: slow');
    fireEvent.press(view.getByLabelText('Share error'));
    expect(share).toHaveBeenLastCalledWith({ message: 'warning: slow' });
  });
});
