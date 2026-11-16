/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

const mockApprovals = { policy: 'auto_approve_read_only', ready: true };
jest.mock('@/src/features/settings/tool-approvals/useToolApprovalPolicySync', () => ({
  useToolApprovalPolicySync: () => mockApprovals,
}));

const mockRunCodeAgain = jest.fn();
jest.mock('@/src/features/chat/services/codeRun', () => ({
  CODE_RUN_FAILED: 'The code did not run. Try again.',
  runCodeAgain: (input: unknown) => mockRunCodeAgain(input),
}));
jest.mock('@/src/features/billing/store', () => ({
  useTierStore: (select: (state: { grantedCapabilities: string[] }) => unknown) =>
    select({ grantedCapabilities: ['canUseCloudExecution'] }),
}));
jest.mock('@/src/features/chat/store/appModeStore', () => ({
  useChatAppModeStore: (select: (state: { appMode: string }) => unknown) =>
    select({ appMode: 'cloud' }),
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

import { CHAT_CODE_RUN_CONFIRMATION } from '@agiworkforce/cloud-contracts';
import { CODE_RUN_TOOK_TOO_LONG, CodeRunAgain } from '@/src/features/chat/components/CodeRunAgain';

async function runOnce() {
  const view = render(<CodeRunAgain conversationId="conv-1" language="python" code="print(1)" />);
  await act(async () => {
    fireEvent.press(view.getByLabelText('Run this code again'));
  });
  return view;
}

describe('CodeRunAgain results', () => {
  beforeEach(() => mockRunCodeAgain.mockReset());

  it('labels the output and the error of a re-run', async () => {
    mockRunCodeAgain.mockResolvedValue({
      ok: true,
      result: { output: '1', error: 'Traceback: boom', images: [] },
    });
    const view = await runOnce();
    expect(mockRunCodeAgain).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-1', language: 'python', code: 'print(1)' }),
    );
    expect(view.getByText('Output')).toBeTruthy();
    expect(view.getByText('1')).toBeTruthy();
    expect(view.getByText('Error')).toBeTruthy();
    expect(view.getByText('Traceback: boom')).toBeTruthy();
  });

  it('draws re-run plots through the shared image rule and drops data it rejects', async () => {
    mockRunCodeAgain.mockResolvedValue({
      ok: true,
      result: { output: '', error: null, images: ['iVBORw0K\nGgo=', 'not base64!'] },
    });
    const view = await runOnce();
    expect(view.getByLabelText('Code output 1').props.source).toEqual({
      uri: 'data:image/png;base64,iVBORw0KGgo=',
    });
    expect(view.queryByLabelText('Code output 2')).toBeNull();
  });

  it('says the run took too long when the request times out, not that it did not run', async () => {
    mockRunCodeAgain.mockRejectedValue(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    const view = await runOnce();
    expect(view.getByText(CODE_RUN_TOOK_TOO_LONG)).toBeTruthy();
    expect(view.queryByText('The code did not run. Try again.')).toBeNull();
  });

  it('keeps the did-not-run message for any other failure', async () => {
    mockRunCodeAgain.mockRejectedValue(new TypeError('Network request failed'));
    const view = await runOnce();
    expect(view.getByText('The code did not run. Try again.')).toBeTruthy();
  });
});

describe('CodeRunAgain respects the approval setting', () => {
  beforeEach(() => {
    mockRunCodeAgain.mockReset();
    mockRunCodeAgain.mockResolvedValue({
      ok: true,
      result: { output: '1', error: null, images: [] },
    });
  });
  afterEach(() => {
    mockApprovals.policy = 'auto_approve_read_only';
    mockApprovals.ready = true;
    jest.restoreAllMocks();
  });

  type AlertButtons = { text?: string; onPress?: () => void }[];

  it('asks before running again when approvals ask before every action', async () => {
    mockApprovals.policy = 'ask_every_time';
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const view = await runOnce();
    expect(mockRunCodeAgain).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(
      CHAT_CODE_RUN_CONFIRMATION.title,
      CHAT_CODE_RUN_CONFIRMATION.message,
      expect.any(Array),
    );
    const buttons = alert.mock.calls[0]![2] as AlertButtons;
    expect(buttons.map((button) => button.text)).toEqual(['Cancel', 'Run again']);
    await act(async () => {
      buttons[1]!.onPress?.();
    });
    expect(mockRunCodeAgain).toHaveBeenCalledTimes(1);
    expect(mockRunCodeAgain).toHaveBeenCalledWith(expect.objectContaining({ approved: true }));
    expect(view.getByText('Output')).toBeTruthy();
  });

  it('sends no approval when the setting does not ask first', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await runOnce();
    expect(alert).not.toHaveBeenCalled();
    expect(mockRunCodeAgain).toHaveBeenCalledTimes(1);
    expect(mockRunCodeAgain.mock.calls[0]![0]).not.toHaveProperty('approved');
  });

  it('runs nothing when the person cancels', async () => {
    mockApprovals.policy = 'ask_every_time';
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await runOnce();
    const buttons = alert.mock.calls[0]![2] as AlertButtons;
    expect(buttons[0]!.onPress).toBeUndefined();
    expect(mockRunCodeAgain).not.toHaveBeenCalled();
  });

  it('asks while the approval setting has not loaded', async () => {
    mockApprovals.ready = false;
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await runOnce();
    expect(alert).toHaveBeenCalledTimes(1);
    expect(mockRunCodeAgain).not.toHaveBeenCalled();
  });

  it('asks first and runs approved when the server says the run needs approval', async () => {
    mockRunCodeAgain.mockReset();
    mockRunCodeAgain
      .mockResolvedValueOnce({
        ok: false,
        message: 'Your approvals are set to ask before every action. Approve this run to start it.',
        approvalRequired: true,
      })
      .mockResolvedValueOnce({ ok: true, result: { output: '2', error: null, images: [] } });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const view = await runOnce();
    expect(mockRunCodeAgain.mock.calls[0]![0]).not.toHaveProperty('approved');
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0]![0]).toBe(CHAT_CODE_RUN_CONFIRMATION.title);
    const buttons = alert.mock.calls[0]![2] as AlertButtons;
    await act(async () => {
      buttons[1]!.onPress?.();
    });
    expect(mockRunCodeAgain).toHaveBeenCalledTimes(2);
    expect(mockRunCodeAgain.mock.calls[1]![0]).toEqual(expect.objectContaining({ approved: true }));
    expect(view.getByText('2')).toBeTruthy();
  });

  it('shows the server message when an approved run is still refused', async () => {
    mockApprovals.policy = 'ask_every_time';
    mockRunCodeAgain.mockReset();
    mockRunCodeAgain.mockResolvedValue({
      ok: false,
      message: 'Approve this run to start it.',
      approvalRequired: true,
    });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const view = await runOnce();
    const buttons = alert.mock.calls[0]![2] as AlertButtons;
    await act(async () => {
      buttons[1]!.onPress?.();
    });
    expect(alert).toHaveBeenCalledTimes(1);
    expect(view.getByText('Approve this run to start it.')).toBeTruthy();
  });

  it('runs straight away when sandboxed code may run without asking', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await runOnce();
    expect(alert).not.toHaveBeenCalled();
    expect(mockRunCodeAgain).toHaveBeenCalledTimes(1);
  });
});
