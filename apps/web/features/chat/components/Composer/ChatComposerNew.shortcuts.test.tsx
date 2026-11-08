import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatComposerNew } from './ChatComposerNew';
import { __resetComposerDraftStorageForTests } from './composer-draft-storage';

type ScanModule0 = typeof import('@features/chat/hooks/use-dictation');

const dictation = vi.hoisted(() => ({
  active: false,
  deliverResult: false,
  start: vi.fn(),
  stop: vi.fn(),
  send: vi.fn(),
  onInsert: undefined as undefined | ((text: string) => void),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

vi.mock('@features/settings/components/SettingsModalProvider', () => ({
  useSettingsModal: () => ({ isOpen: false, openSettings: vi.fn(), closeSettings: vi.fn() }),
}));

vi.mock('@features/chat/hooks/use-skills-list', () => ({
  useSkillsList: () => ({ skills: [], loading: false, error: null }),
}));

vi.mock('@features/chat/hooks/use-media-model-availability', () => ({
  useMediaModelAvailability: () => ({
    status: 'ready',
    error: null,
    admissionFor: vi.fn(),
    retry: vi.fn(),
  }),
}));

vi.mock('@features/connectors/hooks/use-connectors', () => ({
  useConnectors: () => ({
    connectedIds: new Set<string>(),
    sources: {} as Record<string, string>,
    customNames: {} as Record<string, string>,
    toolConnectorIds: {} as Record<string, string>,
  }),
}));

vi.mock('@features/chat/hooks/use-dictation', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  useDictation: (options: { onInsert: (text: string) => void }) => {
    dictation.onInsert = options.onInsert;
    return {
      status: dictation.active ? 'recording' : 'idle',
      isActive: dictation.active,
      error: null,
      bars: [],
      level: 0,
      announcement: '',
      reducedMotion: false,
      start: dictation.start,
      stop: () => {
        dictation.stop();
        if (dictation.deliverResult) dictation.onInsert?.('Noted from dictation');
      },
      send: dictation.send,
      cancel: vi.fn(),
      retry: vi.fn(),
    };
  },
}));

function composer() {
  render(<ChatComposerNew onSend={vi.fn()} />);
  return screen.getByRole('textbox', { name: /message input/i });
}

function chord(key: string) {
  return { key, ctrlKey: true, metaKey: true, shiftKey: true };
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  __resetComposerDraftStorageForTests();
  dictation.active = false;
  dictation.deliverResult = false;
  dictation.start.mockClear();
  dictation.stop.mockClear();
  dictation.send.mockClear();
});

describe('composer shortcuts', () => {
  it('starts voice mode without sending the draft', () => {
    const onSend = vi.fn();
    const onEnterVoiceMode = vi.fn();
    render(<ChatComposerNew onSend={onSend} onEnterVoiceMode={onEnterVoiceMode} />);
    const textarea = screen.getByRole('textbox', { name: /message input/i });

    fireEvent.click(screen.getByRole('button', { name: 'Start voice mode' }));

    expect(onEnterVoiceMode).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
    expect(dictation.start).not.toHaveBeenCalled();
    expect(textarea).toHaveValue('');
  });

  it('puts a dictation result in the composer without sending it', () => {
    dictation.active = true;
    dictation.deliverResult = true;
    const onSend = vi.fn();
    render(<ChatComposerNew onSend={onSend} />);

    fireEvent.click(screen.getByRole('button', { name: 'Stop recording and edit the transcript' }));

    expect(screen.getByRole('textbox', { name: /message input/i })).toHaveValue(
      'Noted from dictation',
    );
    expect(onSend).not.toHaveBeenCalled();
    expect(dictation.send).not.toHaveBeenCalled();
  });

  it('starts dictation without sending the draft', () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn() },
    });
    const onSend = vi.fn();
    render(<ChatComposerNew onSend={onSend} />);
    const textarea = screen.getByRole('textbox', { name: /message input/i });
    fireEvent.change(textarea, { target: { value: 'Keep this draft' } });

    fireEvent.click(screen.getByRole('button', { name: 'Start voice input' }));

    expect(dictation.start).toHaveBeenCalledTimes(1);
    expect(dictation.send).not.toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
    expect(textarea).toHaveValue('Keep this draft');
    Reflect.deleteProperty(navigator, 'mediaDevices');
  });

  it('opens the file picker from the add files chord', () => {
    const textarea = composer();
    const fileInput = screen.getByLabelText('File upload') as HTMLInputElement;
    const click = vi.spyOn(fileInput, 'click');

    const claimed = fireEvent.keyDown(textarea, chord('U'));

    expect(click).toHaveBeenCalledTimes(1);
    expect(claimed).toBe(false);
  });

  it('starts dictation from the dictation chord', () => {
    const textarea = composer();

    fireEvent.keyDown(textarea, chord('S'));

    expect(dictation.start).toHaveBeenCalledTimes(1);
    expect(dictation.stop).not.toHaveBeenCalled();
  });

  it('stops dictation from the dictation chord while it runs', () => {
    dictation.active = true;
    const textarea = composer();

    fireEvent.keyDown(textarea, chord('S'));

    expect(dictation.stop).toHaveBeenCalledTimes(1);
    expect(dictation.start).not.toHaveBeenCalled();
  });

  it('ignores both chords without the Shift modifier', () => {
    const textarea = composer();
    const fileInput = screen.getByLabelText('File upload') as HTMLInputElement;
    const click = vi.spyOn(fileInput, 'click');

    fireEvent.keyDown(textarea, { key: 'U', ctrlKey: true, metaKey: true });
    fireEvent.keyDown(textarea, { key: 'S', ctrlKey: true, metaKey: true });

    expect(click).not.toHaveBeenCalled();
    expect(dictation.start).not.toHaveBeenCalled();
  });
});

type ReadonlyIdentityModule = typeof import('@/lib/identity/useSessionSnapshot');

vi.mock('@/lib/identity/useSessionSnapshot', async (importOriginal) => {
  const lifetime = { isCurrent: () => true };
  const capture = () => lifetime;
  return {
    ...(await importOriginal<ReadonlyIdentityModule>()),
    useReadonlyIdentityLifetime: () => capture,
  };
});
