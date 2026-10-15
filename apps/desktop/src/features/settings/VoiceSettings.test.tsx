import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VoiceCapabilities } from '../../api/voice';

const mocks = vi.hoisted(() => {
  const api = {
    voiceCheckLocalWhisper: vi.fn().mockResolvedValue(false),
    voiceCheckPiperBinary: vi.fn().mockResolvedValue(true),
    voiceDownloadPiperBinary: vi.fn().mockResolvedValue('/bin/piper'),
  };
  const voiceInput = {
    hotkey: 'option',
    voiceProvider: 'local_whisper',
    inputDeviceId: null as string | null,
    inputDeviceLabel: null as string | null,
    voiceLanguage: 'en',
    voiceMode: 'idle',
    postProcessingMode: 'basic',
    setHotkey: vi.fn(),
    setProvider: vi.fn(),
    setInputDevice: vi.fn(),
    setLanguage: vi.fn(),
    setPostProcessingMode: vi.fn(),
    startListening: vi.fn(),
    stopListening: vi.fn(),
  };
  const voiceMode = {
    capabilities: null as VoiceCapabilities | null,
    wakeWordActive: false,
    globalPttActive: false,
    bargeInEnabled: false,
    speakRepliesEnabled: false,
    setSpeakRepliesEnabled: vi.fn(),
    fetchCapabilities: vi.fn().mockResolvedValue(undefined),
    enableWakeWord: vi.fn(),
    disableWakeWord: vi.fn(),
    startGlobalPtt: vi.fn(),
    stopGlobalPtt: vi.fn(),
    enableBargeIn: vi.fn(),
    listWhisperModels: vi.fn().mockResolvedValue([]),
    downloadWhisperModel: vi.fn(),
    listPiperVoices: vi.fn().mockResolvedValue([]),
    downloadPiperVoice: vi.fn(),
  };
  return { api, voiceInput, voiceMode };
});

vi.mock('../../api/voice', async (importOriginal) => ({
  ...(await importOriginal<VoiceModule>()),
  voiceCheckLocalWhisper: mocks.api.voiceCheckLocalWhisper,
  voiceCheckPiperBinary: mocks.api.voiceCheckPiperBinary,
  voiceDownloadPiperBinary: mocks.api.voiceDownloadPiperBinary,
}));

vi.mock('../../stores/settingsStore', () => ({
  useVoiceInputStore: (selector: (state: typeof mocks.voiceInput) => unknown) =>
    selector(mocks.voiceInput),
  useVoiceModeStore: (selector: (state: typeof mocks.voiceMode) => unknown) =>
    selector(mocks.voiceMode),
}));

vi.mock('./VoicePersonaSelector', () => ({
  VoicePersonaSelector: () => null,
}));

import { listen } from '../../lib/tauri-mock';
import { PROVIDER_OPTIONS, VoiceSettings } from './VoiceSettings';

type VoiceModule = typeof import('../../api/voice');

// The backend lists the catalog's voices; the component treats the ID as opaque.
// The shape `voice_list_whisper_models` serialises (features/speech/local_stt.rs).
const whisperModel = {
  size: 'base',
  filename: 'fixture-base.bin',
  description: 'Balanced speed and accuracy',
  approximate_size_mb: 147,
  is_downloaded: false,
  path: null as string | null,
};

const piperVoice = {
  id: 'fixture-piper-voice',
  name: 'Amy',
  language: 'en_US',
  isDownloaded: false,
  modelPath: null,
};

function capabilitiesWith(
  systemDictationAvailable: boolean,
  overrides: Partial<VoiceCapabilities> = {},
): VoiceCapabilities {
  return {
    ttsAvailable: false,
    ttsProvider: 'System',
    ttsPlaying: false,
    wakeWordEnabled: false,
    wakeWordAvailable: false,
    bargeInEnabled: false,
    bargeInSensitivity: 0.5,
    vadAvailable: false,
    localSttAvailable: false,
    localSttModel: null,
    localTtsAvailable: false,
    localTtsVoice: null,
    systemDictationAvailable,
    ...overrides,
  };
}

function controlRow(label: string): HTMLElement {
  return screen.getByText(label).closest('.flex') as HTMLElement;
}

describe('VoiceSettings, honest system dictation presentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.voiceMode.capabilities = null;
    mocks.voiceMode.globalPttActive = false;
    mocks.voiceInput.voiceProvider = 'local_whisper';
    mocks.voiceInput.inputDeviceId = null;
    mocks.voiceInput.inputDeviceLabel = null;
    mocks.api.voiceCheckLocalWhisper.mockResolvedValue(false);
  });

  it('warns when Local Whisper is selected but not compiled into this build', async () => {
    mocks.voiceInput.voiceProvider = 'local_whisper';
    mocks.api.voiceCheckLocalWhisper.mockResolvedValue(false);
    render(<VoiceSettings />);
    expect(
      await screen.findByText(/Local Whisper is not compiled into this build/i),
    ).toBeInTheDocument();
  });

  it('does not warn about Local Whisper when the backend reports it available', async () => {
    mocks.voiceInput.voiceProvider = 'local_whisper';
    mocks.api.voiceCheckLocalWhisper.mockResolvedValue(true);
    render(<VoiceSettings />);
    await screen.findByText('Transcription Provider');
    await vi.waitFor(() => {
      expect(
        screen.queryByText(/Local Whisper is not compiled into this build/i),
      ).not.toBeInTheDocument();
    });
  });

  it('presents system dictation as unavailable while the capability probe is false', () => {
    mocks.voiceMode.capabilities = capabilitiesWith(false);
    render(<VoiceSettings />);

    const row = controlRow('System-wide Dictation');
    expect(within(row).getByText(/Not available in this build/i)).toBeInTheDocument();
    expect(screen.queryByText(/Hold the Fn key system-wide/i)).not.toBeInTheDocument();

    const button = within(row).getByRole('button', { name: /Unavailable/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(mocks.voiceMode.startGlobalPtt).not.toHaveBeenCalled();
  });

  it('fails closed to unavailable while capabilities have not loaded', () => {
    mocks.voiceMode.capabilities = null;
    render(<VoiceSettings />);

    const row = controlRow('System-wide Dictation');
    expect(within(row).getByText(/Not available in this build/i)).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: /Unavailable/i })).toBeDisabled();
  });

  it('enables the control only when the backend probe reports availability', () => {
    mocks.voiceMode.capabilities = capabilitiesWith(true);
    render(<VoiceSettings />);

    const row = controlRow('System-wide Dictation');
    expect(within(row).queryByText(/Not available in this build/i)).not.toBeInTheDocument();
    const button = within(row).getByRole('button', { name: /Enable/i });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(mocks.voiceMode.startGlobalPtt).toHaveBeenCalledTimes(1);
  });

  it('keeps wake word detection disabled, with the reason, while the detector cannot match a phrase', () => {
    mocks.voiceMode.capabilities = capabilitiesWith(false);
    render(<VoiceSettings />);

    const row = controlRow('Wake Word Detection');
    expect(within(row).getByText(/cannot recognise a wake phrase yet/i)).toBeInTheDocument();
    const button = within(row).getByRole('button', { name: /Unavailable/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(/cannot recognise a wake phrase yet/i);
    fireEvent.click(button);
    expect(mocks.voiceMode.enableWakeWord).not.toHaveBeenCalled();
  });

  it('enables wake word detection only when the backend reports the detector available', () => {
    mocks.voiceMode.capabilities = capabilitiesWith(false, { wakeWordAvailable: true });
    render(<VoiceSettings />);

    const row = controlRow('Wake Word Detection');
    fireEvent.click(within(row).getByRole('button', { name: /Enable/i }));
    expect(mocks.voiceMode.enableWakeWord).toHaveBeenCalledTimes(1);
  });

  it('withholds spoken replies and barge-in where no voice can speak', () => {
    mocks.voiceMode.capabilities = capabilitiesWith(false, { vadAvailable: true });
    render(<VoiceSettings />);

    const replies = controlRow('Speak Assistant Replies');
    expect(within(replies).getByText(/No voice can speak on this device yet/i)).toBeInTheDocument();
    const repliesButton = within(replies).getByRole('button', { name: /Unavailable/i });
    expect(repliesButton).toBeDisabled();
    fireEvent.click(repliesButton);
    expect(mocks.voiceMode.setSpeakRepliesEnabled).not.toHaveBeenCalled();

    const bargeIn = controlRow('Barge-in Detection');
    const bargeInButton = within(bargeIn).getByRole('button', { name: /Unavailable/i });
    expect(bargeInButton).toBeDisabled();
    fireEvent.click(bargeInButton);
    expect(mocks.voiceMode.enableBargeIn).not.toHaveBeenCalled();
    expect(screen.getByText('TTS: Unavailable')).toBeInTheDocument();
  });

  it('offers spoken replies through the local voice where the system voice is not implemented', () => {
    mocks.voiceMode.capabilities = capabilitiesWith(false, {
      vadAvailable: true,
      localTtsAvailable: true,
      localTtsVoice: piperVoice.id,
    });
    render(<VoiceSettings />);

    expect(screen.getByText(`TTS: Local voice (${piperVoice.id})`)).toBeInTheDocument();
    fireEvent.click(
      within(controlRow('Speak Assistant Replies')).getByRole('button', { name: /Enable/i }),
    );
    expect(mocks.voiceMode.setSpeakRepliesEnabled).toHaveBeenCalledWith(true);
    fireEvent.click(
      within(controlRow('Barge-in Detection')).getByRole('button', { name: /Enable/i }),
    );
    expect(mocks.voiceMode.enableBargeIn).toHaveBeenCalledWith(true);
  });

  it('never presents the feature with competitor branding', () => {
    mocks.voiceMode.capabilities = capabilitiesWith(false);
    const { container } = render(<VoiceSettings />);
    expect(container.textContent).not.toMatch(/wispr/i);
  });

  it('offers only the explicit fail-closed transcription modes', () => {
    expect(PROVIDER_OPTIONS.map((option) => option.value)).toEqual([
      'local_whisper',
      'openai_whisper',
      'managed_cloud',
    ]);
    expect(
      PROVIDER_OPTIONS.every((option) => !/deepgram/i.test(`${option.value} ${option.label}`)),
    ).toBe(true);
  });

  it('renders the microphone picker with a system-default fallback', () => {
    mocks.voiceMode.capabilities = capabilitiesWith(false);
    render(<VoiceSettings />);
    expect(screen.getByText('Microphone')).toBeInTheDocument();
    expect(screen.getByText('System default')).toBeInTheDocument();
    expect(screen.getByText(/falls back to the system default/i)).toBeInTheDocument();
  });

  it('names the saved microphone when device enumeration cannot see it', () => {
    mocks.voiceMode.capabilities = capabilitiesWith(false);
    mocks.voiceInput.inputDeviceId = 'mic-42';
    mocks.voiceInput.inputDeviceLabel = 'Blue Yeti';
    render(<VoiceSettings />);
    expect(screen.getByText('Blue Yeti (unavailable)')).toBeInTheDocument();
  });

  it('still offers the saved microphone when its label was never captured', () => {
    mocks.voiceMode.capabilities = capabilitiesWith(false);
    mocks.voiceInput.inputDeviceId = 'mic-42';
    mocks.voiceInput.inputDeviceLabel = null;
    render(<VoiceSettings />);
    expect(screen.getByText('Saved microphone (unavailable)')).toBeInTheDocument();
  });

  it('does not offer Whisper model downloads a build without on-device Whisper cannot use', async () => {
    mocks.api.voiceCheckLocalWhisper.mockResolvedValue(false);
    mocks.voiceMode.listWhisperModels.mockResolvedValue([{ ...whisperModel }]);
    render(<VoiceSettings />);

    expect(await screen.findByText(/does not include on-device Whisper/i)).toBeInTheDocument();
    expect(screen.queryByText('base')).not.toBeInTheDocument();
  });

  it('fetches the Piper engine before the first Piper voice, which cannot speak without it', async () => {
    mocks.api.voiceCheckPiperBinary.mockResolvedValueOnce(false);
    mocks.voiceMode.listPiperVoices.mockResolvedValue([piperVoice]);
    render(<VoiceSettings />);

    await screen.findByText('Amy');
    fireEvent.click(
      within(screen.getByText('Amy').closest('div')!.parentElement!).getByRole('button', {
        name: /Download/,
      }),
    );

    await vi.waitFor(() =>
      expect(mocks.voiceMode.downloadPiperVoice).toHaveBeenCalledWith(piperVoice.id),
    );
    expect(mocks.api.voiceDownloadPiperBinary).toHaveBeenCalledTimes(1);
    expect(mocks.api.voiceDownloadPiperBinary.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.voiceMode.downloadPiperVoice.mock.invocationCallOrder[0]!,
    );
  });

  it('does not fetch the Piper engine again once it is installed', async () => {
    mocks.api.voiceCheckPiperBinary.mockResolvedValueOnce(true);
    mocks.voiceMode.listPiperVoices.mockResolvedValue([piperVoice]);
    render(<VoiceSettings />);

    await screen.findByText('Amy');
    fireEvent.click(
      within(screen.getByText('Amy').closest('div')!.parentElement!).getByRole('button', {
        name: /Download/,
      }),
    );

    await vi.waitFor(() =>
      expect(mocks.voiceMode.downloadPiperVoice).toHaveBeenCalledWith(piperVoice.id),
    );
    expect(mocks.api.voiceDownloadPiperBinary).not.toHaveBeenCalled();
  });

  it('shows how far a Piper voice download has got', async () => {
    const handlers = new Map<string, (event: { payload: unknown }) => void>();
    vi.mocked(listen).mockImplementation(async (event, handler) => {
      handlers.set(event, handler as (event: { payload: unknown }) => void);
      return () => handlers.delete(event);
    });
    mocks.voiceMode.downloadPiperVoice.mockImplementation(() => new Promise(() => undefined));
    mocks.voiceMode.listPiperVoices.mockResolvedValue([piperVoice]);
    render(<VoiceSettings />);

    await screen.findByText('Amy');
    const row = screen.getByText('Amy').closest('div')!.parentElement!;
    fireEvent.click(within(row).getByRole('button', { name: /Download/ }));

    await vi.waitFor(() => expect(handlers.has('voice:piper_download_progress')).toBe(true));
    handlers.get('voice:piper_download_progress')?.({
      payload: { bytesDownloaded: 42, totalBytes: 100, percentage: 42.4 },
    });

    expect(await within(row).findByRole('button', { name: /42%/ })).toBeInTheDocument();
  });

  it('hears progress the download reports as soon as it starts', async () => {
    const handlers = new Map<string, (event: { payload: unknown }) => void>();
    vi.mocked(listen).mockImplementation(async (event, handler) => {
      handlers.set(event, handler as (event: { payload: unknown }) => void);
      return () => handlers.delete(event);
    });
    mocks.api.voiceCheckPiperBinary.mockResolvedValueOnce(true);
    mocks.voiceMode.downloadPiperVoice.mockImplementation(() => {
      handlers.get('voice:piper_download_progress')?.({
        payload: { bytesDownloaded: 7, totalBytes: 100, percentage: 7 },
      });
      return new Promise(() => undefined);
    });
    mocks.voiceMode.listPiperVoices.mockResolvedValue([piperVoice]);
    render(<VoiceSettings />);

    await screen.findByText('Amy');
    const row = screen.getByText('Amy').closest('div')!.parentElement!;
    fireEvent.click(within(row).getByRole('button', { name: /Download/ }));

    expect(await within(row).findByRole('button', { name: /7%/ })).toBeInTheDocument();
  });

  it('shows each download its own progress when a model and a voice download together', async () => {
    const handlers = new Map<string, (event: { payload: unknown }) => void>();
    vi.mocked(listen).mockImplementation(async (event, handler) => {
      handlers.set(event, handler as (event: { payload: unknown }) => void);
      return () => handlers.delete(event);
    });
    mocks.api.voiceCheckLocalWhisper.mockResolvedValue(true);
    mocks.voiceMode.listWhisperModels.mockResolvedValue([{ ...whisperModel }]);
    mocks.voiceMode.downloadWhisperModel.mockImplementation(() => new Promise(() => undefined));
    mocks.voiceMode.downloadPiperVoice.mockImplementation(() => new Promise(() => undefined));
    mocks.voiceMode.listPiperVoices.mockResolvedValue([piperVoice]);
    render(<VoiceSettings />);

    await screen.findByText('base');
    await screen.findByText('Amy');
    const modelRow = screen.getByText('base').closest('div')!.parentElement!;
    const voiceRow = screen.getByText('Amy').closest('div')!.parentElement!;
    fireEvent.click(within(modelRow).getByRole('button', { name: /Download/ }));
    fireEvent.click(within(voiceRow).getByRole('button', { name: /Download/ }));

    await vi.waitFor(() => {
      expect(handlers.has('voice:whisper_download_progress')).toBe(true);
      expect(handlers.has('voice:piper_download_progress')).toBe(true);
    });
    handlers.get('voice:whisper_download_progress')?.({
      payload: { bytesDownloaded: 30, totalBytes: 100, percentage: 30 },
    });
    handlers.get('voice:piper_download_progress')?.({
      payload: { bytesDownloaded: 80, totalBytes: 100, percentage: 80 },
    });

    expect(await within(modelRow).findByRole('button', { name: /30%/ })).toBeInTheDocument();
    expect(within(voiceRow).getByRole('button', { name: /80%/ })).toBeInTheDocument();
  });

  it('shows each Whisper model with its size and whether it is already on disk', async () => {
    mocks.api.voiceCheckLocalWhisper.mockResolvedValue(true);
    mocks.voiceMode.listWhisperModels.mockResolvedValue([
      { ...whisperModel },
      {
        ...whisperModel,
        size: 'small',
        approximate_size_mb: 466,
        is_downloaded: true,
        path: '/models/fixture-small.bin',
      },
    ]);
    render(<VoiceSettings />);

    const pending = (await screen.findByText('base')).closest('div')!.parentElement!;
    const installed = screen.getByText('small').closest('div')!.parentElement!;
    expect(within(pending).getByText('(147 MB)')).toBeInTheDocument();
    expect(within(pending).getByRole('button', { name: /Download/ })).toBeInTheDocument();
    expect(within(installed).getByText('(466 MB)')).toBeInTheDocument();
    expect(within(installed).getByText('Downloaded')).toBeInTheDocument();
    expect(within(installed).queryByRole('button', { name: /Download/ })).not.toBeInTheDocument();
  });

  it('lists Whisper models when the build includes on-device Whisper', async () => {
    mocks.api.voiceCheckLocalWhisper.mockResolvedValue(true);
    mocks.voiceMode.listWhisperModels.mockResolvedValue([{ ...whisperModel }]);
    render(<VoiceSettings />);

    expect(await screen.findByText('base')).toBeInTheDocument();
    expect(screen.queryByText(/does not include on-device Whisper/i)).not.toBeInTheDocument();
  });
});
