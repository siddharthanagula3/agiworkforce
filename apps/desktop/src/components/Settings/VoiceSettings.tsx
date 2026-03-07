import { useCallback, useState } from 'react';
import { Mic, MicOff, Loader2, Sparkles, Zap, Ban } from 'lucide-react';
import { Label } from '../ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';
import { useVoiceInputStore, type PostProcessingMode } from '../../stores/voiceInputStore';

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
  const provider = useVoiceInputStore((s) => s.provider);
  const language = useVoiceInputStore((s) => s.language);
  const mode = useVoiceInputStore((s) => s.mode);
  const postProcessingMode = useVoiceInputStore((s) => s.postProcessingMode);
  const setHotkey = useVoiceInputStore((s) => s.setHotkey);
  const setProvider = useVoiceInputStore((s) => s.setProvider);
  const setLanguage = useVoiceInputStore((s) => s.setLanguage);
  const setPostProcessingMode = useVoiceInputStore((s) => s.setPostProcessingMode);
  const startListening = useVoiceInputStore((s) => s.startListening);
  const stopListening = useVoiceInputStore((s) => s.stopListening);

  const [testError, setTestError] = useState<string | null>(null);

  const handleTestToggle = useCallback(async () => {
    setTestError(null);
    try {
      if (mode === 'idle') {
        await startListening();
        // Auto-stop after 5 seconds for the test
        setTimeout(() => {
          void stopListening();
        }, 5000);
      } else {
        await stopListening();
      }
    } catch (err) {
      setTestError(String(err));
    }
  }, [mode, startListening, stopListening]);

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
                Recording... will auto-stop after 5 seconds
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
                faster model (e.g. Claude Haiku or GPT-5 Nano) reduces the added latency.
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
    </div>
  );
}
