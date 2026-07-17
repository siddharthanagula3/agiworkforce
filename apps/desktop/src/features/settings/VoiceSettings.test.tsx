/**
 * Honest capability presentation for system-wide dictation
 * (DESKTOP-SYSTEM-DICTATION-UNWIRED-01, docs/plans/desktop-system-dictation.md
 * phase 1): while the backend probe `systemDictationAvailable` is false — the
 * shipped state until the plan's release gates pass — the settings UI must
 * not advertise, enable, or activate the global control, and no competitor
 * branding may present the feature.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VoiceCapabilities } from '../../api/voice';

const mocks = vi.hoisted(() => {
  const voiceInput = {
    hotkey: 'option',
    voiceProvider: 'local_whisper',
    voiceLanguage: 'en',
    voiceMode: 'idle',
    postProcessingMode: 'basic',
    setHotkey: vi.fn(),
    setProvider: vi.fn(),
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
  return { voiceInput, voiceMode };
});

vi.mock('../../stores/settingsStore', () => ({
  useVoiceInputStore: (selector: (state: typeof mocks.voiceInput) => unknown) =>
    selector(mocks.voiceInput),
  useVoiceModeStore: (selector: (state: typeof mocks.voiceMode) => unknown) =>
    selector(mocks.voiceMode),
}));

vi.mock('./VoicePersonaSelector', () => ({
  VoicePersonaSelector: () => null,
}));

import { VoiceSettings } from './VoiceSettings';

function capabilitiesWith(systemDictationAvailable: boolean): VoiceCapabilities {
  return {
    ttsAvailable: false,
    ttsProvider: 'System',
    ttsPlaying: false,
    wakeWordEnabled: false,
    pttEnabled: false,
    pttHotkey: '',
    bargeInEnabled: false,
    bargeInSensitivity: 0.5,
    vadAvailable: false,
    localSttAvailable: false,
    localSttModel: null,
    localTtsAvailable: false,
    localTtsVoice: null,
    systemDictationAvailable,
  };
}

describe('VoiceSettings — honest system dictation presentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.voiceMode.capabilities = null;
    mocks.voiceMode.globalPttActive = false;
  });

  it('presents system dictation as unavailable while the capability probe is false', () => {
    mocks.voiceMode.capabilities = capabilitiesWith(false);
    render(<VoiceSettings />);

    expect(screen.getByText('System-wide Dictation')).toBeInTheDocument();
    expect(screen.getByText(/Not available in this build/i)).toBeInTheDocument();
    // The old advertising claim must be gone.
    expect(screen.queryByText(/Hold the Fn key system-wide/i)).not.toBeInTheDocument();

    const button = screen.getByRole('button', { name: /Unavailable/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(mocks.voiceMode.startGlobalPtt).not.toHaveBeenCalled();
  });

  it('fails closed to unavailable while capabilities have not loaded', () => {
    mocks.voiceMode.capabilities = null;
    render(<VoiceSettings />);

    expect(screen.getByText(/Not available in this build/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Unavailable/i })).toBeDisabled();
  });

  it('enables the control only when the backend probe reports availability', () => {
    mocks.voiceMode.capabilities = capabilitiesWith(true);
    render(<VoiceSettings />);

    expect(screen.queryByText(/Not available in this build/i)).not.toBeInTheDocument();
    // Other sections also render "Enable" buttons — scope to this section's row.
    const row = screen.getByText('System-wide Dictation').closest('.flex') as HTMLElement;
    const button = within(row).getByRole('button', { name: /Enable/i });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(mocks.voiceMode.startGlobalPtt).toHaveBeenCalledTimes(1);
  });

  it('never presents the feature with competitor branding', () => {
    mocks.voiceMode.capabilities = capabilitiesWith(false);
    const { container } = render(<VoiceSettings />);
    expect(container.textContent).not.toMatch(/wispr/i);
  });
});
