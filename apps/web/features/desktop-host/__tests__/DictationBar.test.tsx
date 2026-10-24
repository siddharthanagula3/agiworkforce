import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hostBridgeStub } from '@/test/host-bridge-stub';

const controller = {
  status: 'recording' as const,
  isActive: true,
  error: null,
  bars: [0.2, 0.4],
  level: 0.3,
  announcement: '',
  reducedMotion: true,
  start: vi.fn(),
  stop: vi.fn(),
  send: vi.fn(),
  cancel: vi.fn(),
  retry: vi.fn(),
};
let delivered: ((text: string) => void) | null = null;

vi.mock('@features/chat/hooks/use-dictation', () => ({
  useDictation: ({ onInsert }: { onInsert: (text: string) => void }) => {
    delivered = onInsert;
    return controller;
  },
}));

const { DictationBar, DICTATION_BAR_COPY } = await import('../components/DictationBar');
const { useSettingsStore } = await import('@shared/stores/web-settings-store');

let hotkey: (() => void) | null = null;
const finishDictation = vi.fn(async () => 'typed' as const);
const cancelDictation = vi.fn(async () => undefined);

function installBar(withDictation = true) {
  Object.assign(window, {
    agiHost: hostBridgeStub({
      onVoiceHotkey: (callback) => {
        hotkey = callback;
        return () => undefined;
      },
      ...(withDictation ? { finishDictation, cancelDictation } : {}),
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  hotkey = null;
  delivered = null;
  useSettingsStore.setState({ dictationEnabled: true });
});

afterEach(() => {
  Reflect.deleteProperty(window, 'agiHost');
});

describe('the dictation bar over another app', () => {
  it('starts recording when it opens and stops on the shortcut', () => {
    installBar();
    render(<DictationBar />);

    expect(controller.start).toHaveBeenCalledTimes(1);
    act(() => hotkey?.());
    expect(controller.stop).toHaveBeenCalledTimes(1);
  });

  it('hands the transcript to the shell once', () => {
    installBar();
    render(<DictationBar />);

    act(() => delivered?.('hello there'));
    act(() => delivered?.('hello there'));

    expect(finishDictation).toHaveBeenCalledTimes(1);
    expect(finishDictation).toHaveBeenCalledWith('hello there');
  });

  it('tells the shell when the recording is discarded', async () => {
    installBar();
    render(<DictationBar />);

    await userEvent.click(screen.getByRole('button', { name: 'Discard recording' }));

    expect(controller.cancel).toHaveBeenCalled();
    expect(cancelDictation).toHaveBeenCalled();
  });

  it('records nothing outside the bar the shell opened, or with dictation off', () => {
    installBar(false);
    const { unmount } = render(<DictationBar />);
    expect(screen.getByRole('status')).toHaveTextContent(DICTATION_BAR_COPY.outsideShell);
    unmount();

    installBar();
    useSettingsStore.setState({ dictationEnabled: false });
    render(<DictationBar />);
    expect(screen.getByRole('status')).toHaveTextContent(DICTATION_BAR_COPY.dictationOff);
    expect(controller.start).not.toHaveBeenCalled();
  });
});
