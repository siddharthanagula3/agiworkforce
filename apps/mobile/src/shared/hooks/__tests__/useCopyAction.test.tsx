import { Alert } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import {
  COPIED_LABEL,
  COPY_FAILED_LABEL,
  copyControlLabel,
  useCopyAction,
  type CopyAction,
} from '../useCopyAction';

const mockSetStringAsync = jest.fn<Promise<void>, [string]>();

jest.mock(
  'expo-clipboard',
  () => ({ setStringAsync: (text: string) => mockSetStringAsync(text) }),
  { virtual: true },
);

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

let latest: CopyAction | null = null;

function Harness() {
  latest = useCopyAction();
  return null;
}

async function copy(text: string): Promise<boolean> {
  let result = false;
  await act(async () => {
    result = await (latest as CopyAction).copy(text);
  });
  return result;
}

describe('useCopyAction', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockSetStringAsync.mockReset();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Harness />);
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('confirms a write the clipboard accepted and returns to rest on its own', async () => {
    mockSetStringAsync.mockResolvedValue(undefined);

    expect(await copy('the answer')).toBe(true);
    expect(mockSetStringAsync).toHaveBeenCalledWith('the answer');
    expect(latest?.status).toBe('copied');

    act(() => {
      jest.runOnlyPendingTimers();
    });
    await waitFor(() => expect(latest?.status).toBe('idle'));
  });

  it('tells the user when the clipboard refused rather than looking like it worked', async () => {
    mockSetStringAsync.mockRejectedValue(new Error('clipboard unavailable'));

    expect(await copy('the answer')).toBe(false);
    expect(latest?.status).toBe('failed');
    expect(Alert.alert).toHaveBeenCalledWith(COPY_FAILED_LABEL, expect.any(String));
  });

  it('never puts the failure cause in front of the user', async () => {
    mockSetStringAsync.mockRejectedValue(new Error('NSPasteboard denied by profile 41b'));

    await copy('the answer');

    const [, body] = (Alert.alert as jest.Mock).mock.calls[0] as [string, string];
    expect(body).not.toMatch(/NSPasteboard|profile|41b|Error/);
    expect(body).toMatch(/Share/);
  });

  it('writes exactly the text it was handed, so code keeps its shape', async () => {
    mockSetStringAsync.mockResolvedValue(undefined);
    const code = 'def main():\n\n    return {\n        "a": 1,\n    }\n';

    await copy(code);

    expect(mockSetStringAsync).toHaveBeenCalledWith(code);
  });
});

describe('copyControlLabel', () => {
  it('names the state a control is in rather than leaving the resting label', () => {
    expect(copyControlLabel('idle', 'Copy code')).toBe('Copy code');
    expect(copyControlLabel('copied', 'Copy code')).toBe(COPIED_LABEL);
    expect(copyControlLabel('failed', 'Copy code')).toBe(COPY_FAILED_LABEL);
  });
});
