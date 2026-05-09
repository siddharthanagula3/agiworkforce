import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Loader2,
  Sparkles,
  Zap,
  Ban,
  Radio,
  Volume2,
  Shield,
  Download,
  CheckCircle2,
  Globe,
} from 'lucide-react';
import { toast } from 'sonner';
import { Label } from '../ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';
import { useVoiceInputStore, type PostProcessingMode } from '../../stores/settingsStore';
import {
  useVoiceModeStore,
  type WhisperModelInfo,
  type PiperVoiceInfo,
} from '../../stores/settingsStore';
import { VoicePersonaSelector } from './VoicePersonaSelector';

const VOICE_PERSONA_STORAGE_KEY = 'agiworkforce-voice-persona';

const HOTKEY_OPTIONS = [
  { value: 'option', label: 'Option / Alt (hold to dictate)' },
  { value: 'ctrl+space', label: 'Ctrl+Space (hold to dictate)' },
  { value: 'ctrl+shift+v', label: 'Ctrl+Shift+V (hold to dictate)' },
] as const;

const PROVIDER_OPTIONS = [
  { value: 'local_whisper', label: 'Local Whisper (offline)' },
  { value: 'deepgram', label: 'Deepgram (cloud)' },
  { value: 'openai_whisper', label: 'OpenAI Whisper (cloud)' },
] as const;

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'ja', label: 'Japanese' },
  { value: 'zh', label: 'Chinese' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ru', label: 'Russian' },
];

const POST_PROCESSING_OPTIONS: Array<{
  value: PostProcessingMode;
  label: string;
  description: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  {
    value: 'ai',
    label: 'AI Cleanup',
    description:
      'Uses the current model to remove filler words, fix course corrections and add punctuation. Adds ~1s.',
    Icon: Sparkles,
  },
  {
    value: 'basic',
    label: 'Basic Cleanup',
    description: 'Fast regex-based filler word removal (um, uh, like, you know…). No LLM call.',
    Icon: Zap,
  },
  {
    value: 'none',
    label: 'None (raw transcript)',
    description: 'Insert the transcript exactly as spoken with no post-processing.',
    Icon: Ban,
  },
];

export function VoiceSettings() {
  const hotkey = useVoiceInputStore((s) => s.hotkey);
  const provider = useVoiceInputStore((s) => s.voiceProvider);
  const language = useVoiceInputStore((s) => s.voiceLanguage);
  const mode = useVoiceInputStore((s) => s.voiceMode);
  const postProcessingMode = useVoiceInputStore((s) => s.postProcessingMode);
  const setHotkey = useVoiceInputStore((s) => s.setHotkey);
  const setProvider = useVoiceInputStore((s) => s.setProvider);
  const setLanguage = useVoiceInputStore((s) => s.setLanguage);
  const setPostProcessingMode = useVoiceInputStore((s) => s.setPostProcessingMode);
  const startListening = useVoiceInputStore((s) => s.startListening);
  const stopListening = useVoiceInputStore((s) => s.stopListening);

  // Backend voice capabilities and controls
  const capabilities = useVoiceModeStore((s) => s.capabilities);
  const wakeWordActive = useVoiceModeStore((s) => s.wakeWordActive);
  const globalPttActive = useVoiceModeStore((s) => s.globalPttActive);
  const bargeInEnabled = useVoiceModeStore((s) => s.bargeInEnabled);
  const fetchCapabilities = useVoiceModeStore((s) => s.fetchCapabilities);
  const enableWakeWord = useVoiceModeStore((s) => s.enableWakeWord);
  const disableWakeWord = useVoiceModeStore((s) => s.disableWakeWord);
  const startGlobalPtt = useVoiceModeStore((s) => s.startGlobalPtt);
  const stopGlobalPtt = useVoiceModeStore((s) => s.stopGlobalPtt);
  const enableBargeIn = useVoiceModeStore((s) => s.enableBargeIn);
  const listWhisperModels = useVoiceModeStore((s) => s.listWhisperModels);
  const downloadWhisperModel = useVoiceModeStore((s) => s.downloadWhisperModel);
  const listPiperVoices = useVoiceModeStore((s) => s.listPiperVoices);
  const downloadPiperVoice = useVoiceModeStore((s) => s.downloadPiperVoice);

  const [whisperModels, setWhisperModels] = useState<WhisperModelInfo[]>([]);
  const [piperVoices, setPiperVoices] = useState<PiperVoiceInfo[]>([]);
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [downloadingVoice, setDownloadingVoice] = useState<string | null>(null);
  const [selectedPersona, setSelectedPersona] = useState<string>(
    () => localStorage.getItem(VOICE_PERSONA_STORAGE_KEY) ?? 'professional',
  );

  const handlePersonaSelect = useCallback((personaId: string) => {
    setSelectedPersona(personaId);
    localStorage.setItem(VOICE_PERSONA_STORAGE_KEY, personaId);
  }, []);

  // Fetch capabilities and local models on mount
  useEffect(() => {
    fetchCapabilities().catch((err: unknown) => {
      console.error('Failed to fetch voice capabilities:', err);
    });
    listWhisperModels()
      .then(setWhisperModels)
      .catch((err: unknown) => {
        console.error('Failed to load Whisper models:', err);
      });
    listPiperVoices()
      .then(setPiperVoices)
      .catch((err: unknown) => {
        console.error('Failed to load Piper voices:', err);
      });
  }, [fetchCapabilities, listWhisperModels, listPiperVoices]);

  const [testError, setTestError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdown(null);
  }, []);

  const handleTestToggle = useCallback(async () => {
    setTestError(null);
    try {
      if (mode === 'idle') {
        await startListening();
        setCountdown(5);
        countdownRef.current = setInterval(() => {
          setCountdown((prev) => {
            if (prev === null || prev <= 1) {
              clearInterval(countdownRef.current!);
              countdownRef.current = null;
              void stopListening();
              return null;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        stopCountdown();
        await stopListening();
      }
    } catch (err) {
      stopCountdown();
      setTestError(String(err));
    }
  }, [mode, startListening, stopListening, stopCountdown]);

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const isRecording = mode === 'listening';
  const isTranscribing = mode === 'transcribing';
  const isProcessing = mode === 'processing';
  const isBusy = isRecording || isTranscribing || isProcessing;

  const selectedPostProcess = POST_PROCESSING_OPTIONS.find((o) => o.value === postProcessingMode);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1">Voice Dictation</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Hold a hotkey anywhere in the app to dictate text — Wispr Flow style. The transcription is
          automatically inserted into the chat composer.
        </p>

        <div className="rounded-lg border border-border bg-card p-6 space-y-5">
          {/* Hotkey selector */}
          <div className="space-y-2">
            <Label htmlFor="voiceHotkey">Dictation Hotkey</Label>
            <Select value={hotkey} onValueChange={(v) => setHotkey(v as typeof hotkey)}>
              <SelectTrigger id="voiceHotkey">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOTKEY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Hold this key to record — release to transcribe.
            </p>
          </div>

          {/* Provider selector */}
          <div className="space-y-2">
            <Label htmlFor="voiceProvider">Transcription Provider</Label>
            <Select value={provider} onValueChange={(v) => setProvider(v as typeof provider)}>
              <SelectTrigger id="voiceProvider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Language selector */}
          <div className="space-y-2">
            <Label htmlFor="voiceLanguage">Language</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger id="voiceLanguage">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Test button */}
          <div className="space-y-2 pt-2 border-t border-border">
            <Label>Test Microphone</Label>
            <p className="text-xs text-muted-foreground">
              Click to start a 5-second test recording. Check your microphone permissions if it
              fails.
            </p>
            <button
              type="button"
              onClick={() => void handleTestToggle()}
              disabled={isTranscribing || isProcessing}
              className={[
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                isRecording
                  ? 'bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30'
                  : 'bg-muted/40 text-foreground border border-border hover:bg-accent',
                isTranscribing || isProcessing ? 'opacity-50 cursor-not-allowed' : '',
              ].join(' ')}
            >
              {isTranscribing ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Transcribing...
                </>
              ) : isProcessing ? (
                <>
                  <Sparkles size={16} className="animate-pulse text-violet-400" />
                  Cleaning up...
                </>
              ) : isRecording ? (
                <>
                  <MicOff size={16} />
                  Stop Recording
                </>
              ) : (
                <>
                  <Mic size={16} />
                  Test Microphone
                </>
              )}
            </button>
            {isBusy && !isTranscribing && !isProcessing && (
              <p className="text-xs text-red-400 animate-pulse">
                {countdown !== null ? `Recording... ${countdown}s remaining` : 'Recording...'}
              </p>
            )}
            {testError && <p className="text-xs text-destructive">{testError}</p>}
          </div>
        </div>
      </div>

      {/* Post-processing section */}
      <div>
        <h3 className="text-lg font-semibold mb-1">Post-Processing</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Choose how the raw transcript is cleaned up before it is inserted into the composer.
        </p>

        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          {/* Option cards */}
          <div className="space-y-3">
            {POST_PROCESSING_OPTIONS.map(({ value, label, description, Icon }) => {
              const isSelected = postProcessingMode === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPostProcessingMode(value)}
                  className={[
                    'w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors',
                    isSelected
                      ? 'border-border bg-muted/40'
                      : 'border-border bg-card hover:bg-muted/50',
                  ].join(' ')}
                >
                  {/* Radio dot */}
                  <span
                    className={[
                      'mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center',
                      isSelected ? 'border-white/20' : 'border-muted-foreground',
                    ].join(' ')}
                  >
                    {isSelected && <span className="w-2 h-2 rounded-full bg-primary" />}
                  </span>

                  <Icon
                    size={16}
                    className={[
                      'mt-0.5 flex-shrink-0',
                      isSelected ? 'text-foreground' : 'text-muted-foreground',
                    ].join(' ')}
                  />

                  <span className="space-y-0.5">
                    <span
                      className={[
                        'block text-sm font-medium',
                        isSelected ? 'text-foreground' : 'text-foreground',
                      ].join(' ')}
                    >
                      {label}
                    </span>
                    <span className="block text-xs text-muted-foreground leading-snug">
                      {description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Context note for AI mode */}
          {selectedPostProcess?.value === 'ai' && (
            <div className="mt-1 flex items-start gap-2 rounded-md bg-muted/40 border border-border px-3 py-2">
              <Sparkles size={14} className="text-muted-foreground mt-0.5 flex-shrink-0" />
              <p className="text-xs text-muted-foreground leading-snug">
                AI cleanup uses the model currently selected in the model picker. Switching to a
                faster model (e.g. Gemini Flash Lite or GPT-5.4 Mini) reduces the added latency.
              </p>
            </div>
          )}

          {/* Command Mode info */}
          <div className="pt-3 border-t border-border">
            <p className="text-xs font-medium text-foreground mb-1">Voice Command Mode</p>
            <p className="text-xs text-muted-foreground leading-snug">
              Phrases like &quot;make this more formal&quot; or &quot;translate to Spanish&quot; are
              automatically detected as{' '}
              <span className="font-medium text-foreground">commands</span>. Instead of appending
              new text, they edit the current content in the composer.
            </p>
          </div>
        </div>
      </div>

      {/* Advanced Voice Features -- wired to Rust backend */}
      <div>
        <h3 className="text-lg font-semibold mb-1">Advanced Voice Features</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Native voice capabilities powered by the Rust backend.
        </p>

        <div className="rounded-lg border border-border bg-card p-6 space-y-5">
          {/* Capabilities status */}
          {capabilities && (
            <div className="space-y-2">
              <Label>System Status</Label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-2 p-2 rounded bg-muted/30">
                  <Volume2 size={14} className="text-muted-foreground" />
                  <span>
                    TTS: {capabilities.ttsAvailable ? capabilities.ttsProvider : 'Unavailable'}
                  </span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded bg-muted/30">
                  <Globe size={14} className="text-muted-foreground" />
                  <span>VAD: {capabilities.vadAvailable ? 'Available' : 'Not built'}</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded bg-muted/30">
                  <Mic size={14} className="text-muted-foreground" />
                  <span>
                    Local STT:{' '}
                    {capabilities.localSttAvailable
                      ? (capabilities.localSttModel ?? 'Ready')
                      : 'Not downloaded'}
                  </span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded bg-muted/30">
                  <Volume2 size={14} className="text-muted-foreground" />
                  <span>
                    Local TTS:{' '}
                    {capabilities.localTtsAvailable
                      ? (capabilities.localTtsVoice ?? 'Ready')
                      : 'Not downloaded'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Wake Word */}
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <div>
                <Label>Wake Word Detection</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Say a wake phrase to activate voice input hands-free.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (wakeWordActive) {
                    void disableWakeWord();
                  } else {
                    void enableWakeWord();
                  }
                }}
                className={[
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  wakeWordActive
                    ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                    : 'bg-muted/40 text-foreground border border-border hover:bg-accent',
                ].join(' ')}
              >
                <span className="flex items-center gap-1.5">
                  <Radio size={12} />
                  {wakeWordActive ? 'Listening' : 'Enable'}
                </span>
              </button>
            </div>
          </div>

          {/* Global Push-to-Talk */}
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <div>
                <Label>Global Push-to-Talk (Fn key)</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Hold the Fn key system-wide to record and auto-inject text.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (globalPttActive) {
                    void stopGlobalPtt();
                  } else {
                    void startGlobalPtt();
                  }
                }}
                className={[
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  globalPttActive
                    ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                    : 'bg-muted/40 text-foreground border border-border hover:bg-accent',
                ].join(' ')}
              >
                <span className="flex items-center gap-1.5">
                  <Mic size={12} />
                  {globalPttActive ? 'Active' : 'Enable'}
                </span>
              </button>
            </div>
          </div>

          {/* Barge-in Detection */}
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <div>
                <Label>Barge-in Detection</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Interrupt AI speech by talking. Requires VAD support.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void enableBargeIn(!bargeInEnabled)}
                disabled={!capabilities?.vadAvailable}
                className={[
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  bargeInEnabled
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50'
                    : 'bg-muted/40 text-foreground border border-border hover:bg-accent',
                  !capabilities?.vadAvailable ? 'opacity-50 cursor-not-allowed' : '',
                ].join(' ')}
              >
                <span className="flex items-center gap-1.5">
                  <Shield size={12} />
                  {bargeInEnabled ? 'Enabled' : 'Enable'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Voice Persona */}
      <div>
        <h3 className="text-lg font-semibold mb-1">Voice Persona</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Choose a speaking style for AI voice responses. Preview each persona before selecting.
        </p>

        <div className="rounded-lg border border-border bg-card p-6">
          <VoicePersonaSelector selectedPersona={selectedPersona} onSelect={handlePersonaSelect} />
        </div>
      </div>

      {/* Local Models Management */}
      <div>
        <h3 className="text-lg font-semibold mb-1">Local Voice Models</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Download models for fully offline speech recognition and synthesis.
        </p>

        <div className="rounded-lg border border-border bg-card p-6 space-y-5">
          {/* Whisper STT Models */}
          <div className="space-y-2">
            <Label>Whisper STT Models</Label>
            <div className="space-y-2">
              {whisperModels.map((model) => (
                <div
                  key={model.size}
                  className="flex items-center justify-between p-2 rounded bg-muted/30"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <Mic size={14} className="text-muted-foreground" />
                    <span className="font-medium">{model.size}</span>
                    <span className="text-xs text-muted-foreground">
                      ({(model.sizeBytes / 1024 / 1024).toFixed(0)} MB)
                    </span>
                  </div>
                  {model.downloaded ? (
                    <span className="flex items-center gap-1 text-xs text-green-400">
                      <CheckCircle2 size={12} />
                      Downloaded
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={downloadingModel === model.size}
                      onClick={async () => {
                        setDownloadingModel(model.size);
                        try {
                          await downloadWhisperModel(model.size);
                          const updated = await listWhisperModels();
                          setWhisperModels(updated);
                        } catch (err) {
                          console.error('Whisper download failed:', err);
                          toast.error('Failed to download model');
                        } finally {
                          setDownloadingModel(null);
                        }
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-muted/40 border border-border hover:bg-accent transition-colors"
                    >
                      {downloadingModel === model.size ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Download size={12} />
                      )}
                      Download
                    </button>
                  )}
                </div>
              ))}
              {whisperModels.length === 0 && (
                <p className="text-xs text-muted-foreground">Loading models...</p>
              )}
            </div>
          </div>

          {/* Piper TTS Voices */}
          <div className="space-y-2 pt-3 border-t border-border">
            <Label>Piper TTS Voices</Label>
            <div className="space-y-2">
              {piperVoices.slice(0, 6).map((voice) => (
                <div
                  key={voice.id}
                  className="flex items-center justify-between p-2 rounded bg-muted/30"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <Volume2 size={14} className="text-muted-foreground" />
                    <span className="font-medium">{voice.name || voice.id}</span>
                    <span className="text-xs text-muted-foreground">{voice.language}</span>
                  </div>
                  {voice.isDownloaded ? (
                    <span className="flex items-center gap-1 text-xs text-green-400">
                      <CheckCircle2 size={12} />
                      Downloaded
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={downloadingVoice === voice.id}
                      onClick={async () => {
                        setDownloadingVoice(voice.id);
                        try {
                          await downloadPiperVoice(voice.id);
                          const updated = await listPiperVoices();
                          setPiperVoices(updated);
                        } catch (err) {
                          console.error('Piper download failed:', err);
                          toast.error('Failed to download voice');
                        } finally {
                          setDownloadingVoice(null);
                        }
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-muted/40 border border-border hover:bg-accent transition-colors"
                    >
                      {downloadingVoice === voice.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Download size={12} />
                      )}
                      Download
                    </button>
                  )}
                </div>
              ))}
              {piperVoices.length === 0 && (
                <p className="text-xs text-muted-foreground">Loading voices...</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
