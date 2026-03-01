import { useCallback, useState } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { Label } from '../ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';
import { useVoiceInputStore } from '../../stores/voiceInputStore';

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

export function VoiceSettings() {
  const hotkey = useVoiceInputStore((s) => s.hotkey);
  const provider = useVoiceInputStore((s) => s.provider);
  const language = useVoiceInputStore((s) => s.language);
  const mode = useVoiceInputStore((s) => s.mode);
  const setHotkey = useVoiceInputStore((s) => s.setHotkey);
  const setProvider = useVoiceInputStore((s) => s.setProvider);
  const setLanguage = useVoiceInputStore((s) => s.setLanguage);
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
  const isBusy = isRecording || isTranscribing;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1">Voice Dictation</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Hold a hotkey anywhere in the app to dictate text — Wispr Flow style. The transcription
          is automatically inserted into the chat composer.
        </p>

        <div className="rounded-lg border border-border bg-card p-6 space-y-5">
          {/* Hotkey selector */}
          <div className="space-y-2">
            <Label htmlFor="voiceHotkey">Dictation Hotkey</Label>
            <Select
              value={hotkey}
              onValueChange={(v) => setHotkey(v as typeof hotkey)}
            >
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
            <Select
              value={provider}
              onValueChange={(v) => setProvider(v as typeof provider)}
            >
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
              disabled={isTranscribing}
              className={[
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                isRecording
                  ? 'bg-red-500/20 text-red-400 border border-red-500/50 hover:bg-red-500/30'
                  : 'bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20',
                isTranscribing ? 'opacity-50 cursor-not-allowed' : '',
              ].join(' ')}
            >
              {isTranscribing ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Transcribing...
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
            {isBusy && !isTranscribing && (
              <p className="text-xs text-red-400 animate-pulse">
                Recording... will auto-stop after 5 seconds
              </p>
            )}
            {testError && (
              <p className="text-xs text-destructive">{testError}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
