import './VoiceScene.css';
import type { CSSProperties } from 'react';
import { ArrowUp, Mic, Plus, Settings, Square, X } from 'lucide-react';
import { waveformBarPercent } from '@/features/chat/lib/dictation-machine';
import { PRODUCT_BRAND } from '@agiworkforce/types';
import { AppSidebar, PreviewRoot, ReplyActions, TrafficLights } from '../app-preview/AppPreviews';

export type VoiceSceneView = 'session' | 'dictation';

export const VOICE_SCENE_COPY = {
  mode: 'Voice',
  placeholder: 'Type',
  newChat: 'New Chat',
} as const;

const VOICE_SCENE_CLASS = 'agi-voice';
const SESSION_CHATS = [VOICE_SCENE_COPY.newChat, 'Weekly plan', 'Trip packing list'];
const DICTATION_CHATS = ['Release update', 'Weekly plan', 'Trip packing list'];
const DICTATION_TURN = 'Draft a short update for the team about the release.';
const DICTATION_REPLY = 'Here is a first draft. Tell me what to change, or dictate the next part.';
const WAVEFORM_BAR_COUNT = 72;
const WAVEFORM_LEVELS = Array.from({ length: WAVEFORM_BAR_COUNT }, (_, index) =>
  Math.abs(Math.sin(index * 0.61) * Math.cos(index * 0.17)),
);

const SCENE_LABEL: Record<VoiceSceneView, string> = {
  session: 'Authored example of a voice session in AGI Chat',
  dictation: 'Authored example of dictation recording in the AGI Chat composer',
};

function VoiceSession() {
  return (
    <div className="agi-app-main">
      <div className="agi-voice-head">
        <span className="agi-voice-head-name">{PRODUCT_BRAND}</span>
        <span className="agi-voice-head-mode">{VOICE_SCENE_COPY.mode}</span>
        <Settings className="agi-app-icon agi-voice-head-settings" />
      </div>
      <div className="agi-voice-surface">
        <span className="agi-voice-orb">
          <i />
        </span>
        <div className="agi-voice-bar">
          <span className="agi-voice-round">
            <Plus className="agi-app-icon" />
          </span>
          <span className="agi-voice-field">{VOICE_SCENE_COPY.placeholder}</span>
          <span className="agi-voice-round">
            <Mic className="agi-app-icon" />
          </span>
          <span className="agi-voice-round" data-ink="true">
            <X className="agi-app-icon" />
          </span>
        </div>
      </div>
    </div>
  );
}

function DictationRecording() {
  return (
    <div className="agi-app-main">
      <div className="agi-app-thread">
        <p className="agi-app-user">{DICTATION_TURN}</p>
        <div className="agi-app-reply">
          <p>{DICTATION_REPLY}</p>
          <ReplyActions />
        </div>
      </div>
      <div className="agi-app-composer agi-voice-recording">
        <div className="agi-voice-strip">
          <span className="agi-voice-round" data-outline="true">
            <X className="agi-app-icon" />
          </span>
          <span className="agi-voice-wave">
            {WAVEFORM_LEVELS.map((level, index) => (
              <i
                key={index}
                style={{ blockSize: `${waveformBarPercent(level)}%` } as CSSProperties}
              />
            ))}
          </span>
          <span className="agi-voice-round" data-outline="true">
            <Square className="agi-app-icon agi-voice-stop" />
          </span>
          <span className="agi-voice-round" data-ink="true">
            <ArrowUp className="agi-app-icon agi-app-icon--lg" />
          </span>
        </div>
      </div>
    </div>
  );
}

export function VoiceScenePreview({ view = 'session' }: { view?: VoiceSceneView }) {
  const session = view === 'session';
  return (
    <PreviewRoot
      kind="web"
      scene={`voice-${view}`}
      label={SCENE_LABEL[view]}
      className={VOICE_SCENE_CLASS}
    >
      <div className="agi-app-chrome">
        <TrafficLights />
        <span className="agi-app-url">agiworkforce.com/chat</span>
      </div>
      <div className="agi-app-shell">
        <AppSidebar chats={session ? SESSION_CHATS : DICTATION_CHATS} />
        {session ? <VoiceSession /> : <DictationRecording />}
      </div>
    </PreviewRoot>
  );
}
