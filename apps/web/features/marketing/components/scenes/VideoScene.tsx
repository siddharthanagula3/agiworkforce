import './VideoScene.css';
import type { CSSProperties } from 'react';
import {
  AudioLines,
  ChevronDown,
  Download,
  Maximize,
  Mic,
  Play,
  Plus,
  Video,
  Volume2,
  X,
} from 'lucide-react';
import {
  formatCredits,
  getModelMetadataById,
  getRoutingSlotModel,
  getVideoAspectOptionsForModel,
  getVideoDurationOptionsForModel,
  getVideoQualityOptionsForModel,
} from '@agiworkforce/types';
import { estimateVideoCredits } from '@/lib/billing/credit-estimates';
import { AppSidebar, PreviewRoot, TrafficLights } from '../app-preview/AppPreviews';

type VideoSceneView = 'generating' | 'ready';

const VIDEO_MODEL = getModelMetadataById(getRoutingSlotModel('video_generation'));
const ASPECT_OPTIONS = getVideoAspectOptionsForModel(VIDEO_MODEL?.id);
const ASPECT = ASPECT_OPTIONS[0];
const QUALITY_OPTIONS = getVideoQualityOptionsForModel(VIDEO_MODEL?.id, ASPECT?.id);
const QUALITY = QUALITY_OPTIONS[0];
const DURATION_OPTIONS = getVideoDurationOptionsForModel(VIDEO_MODEL?.id, QUALITY);
const DURATION = DURATION_OPTIONS[0];
const ESTIMATE =
  VIDEO_MODEL && ASPECT && QUALITY
    ? estimateVideoCredits({
        modelId: VIDEO_MODEL.id,
        resolution: QUALITY.id,
        aspectRatio: ASPECT.id,
        ...(DURATION === undefined ? {} : { durationSecs: DURATION }),
      })
    : null;

const VIDEO_CHATS = ['Video generation', 'Weekly plan', 'Release notes'];
const VIDEO_PROMPT = 'A paper boat drifting down a rain gutter, slow push-in.';
const VIDEO_ELAPSED = '42s';
const VIDEO_PROGRESS = '38%';

const SCENE_LABELS: Record<VideoSceneView, string> = {
  generating: 'Authored example of a video being generated in a chat',
  ready: 'Authored example of a finished video in a chat',
};

const [RATIO_WIDTH, RATIO_HEIGHT] = (ASPECT?.id ?? '').split(':').map(Number);
const FRAME_STYLE =
  RATIO_WIDTH && RATIO_HEIGHT
    ? ({ '--video-ratio': RATIO_WIDTH / RATIO_HEIGHT } as CSSProperties)
    : undefined;

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function Choice({ label }: { label: string }) {
  return (
    <span className="agi-video-choice">
      {label}
      <ChevronDown className="agi-app-icon agi-app-icon--sm" />
    </span>
  );
}

function VideoComposer() {
  return (
    <div className="agi-app-composer agi-video-composer">
      <span className="agi-app-placeholder">Describe the video you want</span>
      <div className="agi-app-composer-row">
        <Plus className="agi-app-icon agi-app-icon--lg" />
        <span className="agi-video-mode">
          <Video className="agi-app-icon" />
          Video
          <X className="agi-app-icon agi-app-quiet" />
        </span>
        {ASPECT && ASPECT_OPTIONS.length > 1 ? <Choice label={ASPECT.id} /> : null}
        {QUALITY && QUALITY_OPTIONS.length > 1 ? <Choice label={QUALITY.label} /> : null}
        {DURATION !== undefined && DURATION_OPTIONS.length > 1 ? (
          <Choice label={`${DURATION}s`} />
        ) : null}
        {ESTIMATE === null ? null : (
          <span className="agi-video-estimate">
            About {formatCredits(ESTIMATE, { maximumFractionDigits: ESTIMATE < 10 ? 1 : 0 })}
          </span>
        )}
        <span className="agi-video-choice agi-app-end">
          {VIDEO_MODEL?.name ?? 'No video model available'}
          <ChevronDown className="agi-app-icon agi-app-icon--sm" />
        </span>
        <Mic className="agi-app-icon agi-app-icon--lg" />
        <span className="agi-app-send">
          <AudioLines className="agi-app-icon" />
        </span>
      </div>
    </div>
  );
}

function GeneratingReply() {
  return (
    <div className="agi-app-reply">
      <span className="agi-video-status">
        Creating your video
        <span className="agi-video-clock">{VIDEO_ELAPSED}</span>
      </span>
      <div className="agi-video-frame" data-state="generating" style={FRAME_STYLE}>
        <span className="agi-video-dots" />
        <span className="agi-video-pill agi-video-stop">
          <X className="agi-app-icon" />
          Stop generating
        </span>
        <span className="agi-video-pill agi-video-progress">{VIDEO_PROGRESS}</span>
      </div>
    </div>
  );
}

function PaperBoatStill() {
  return (
    <svg
      className="agi-video-still"
      viewBox="0 0 320 180"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        opacity="0.35"
        d="M38 12l-5 20M92 26l-5 20M150 8l-5 20M212 22l-5 20M266 10l-5 20M300 38l-5 20M62 44l-4 16M238 48l-4 16"
      />
      <path opacity="0.5" d="M0 70h320M0 82h320" />
      <path d="M118 112l35 8 13-36 13 36 35-8-20 25h-56z" />
      <path d="M153 120h26M166 84v36" />
      <path opacity="0.6" d="M30 126h68M234 126h68M62 146h196" />
    </svg>
  );
}

function ReadyReply() {
  return (
    <div className="agi-app-reply">
      <span className="agi-video-status">Your video is ready.</span>
      <div className="agi-video-frame" data-state="ready" style={FRAME_STYLE}>
        <PaperBoatStill />
        <span className="agi-video-download">
          <Download className="agi-app-icon" />
        </span>
        <span className="agi-video-controls">
          <Play className="agi-app-icon" />
          {DURATION === undefined ? null : (
            <span className="agi-video-time">
              {clock(0)} / {clock(DURATION)}
            </span>
          )}
          <span className="agi-video-track" />
          <Volume2 className="agi-app-icon" />
          <Maximize className="agi-app-icon" />
        </span>
      </div>
    </div>
  );
}

export function VideoWindow({ view = 'generating' }: { view?: VideoSceneView }) {
  return (
    <PreviewRoot
      kind="web"
      scene={`video-${view}`}
      label={SCENE_LABELS[view]}
      className="agi-video"
    >
      <div className="agi-app-chrome">
        <TrafficLights />
        <span className="agi-app-url">agiworkforce.com/chat</span>
      </div>
      <div className="agi-app-shell">
        <AppSidebar chats={VIDEO_CHATS} />
        <div className="agi-app-main">
          <div className="agi-app-thread">
            <p className="agi-app-user">{VIDEO_PROMPT}</p>
            {view === 'ready' ? <ReadyReply /> : <GeneratingReply />}
          </div>
          <VideoComposer />
        </div>
      </div>
    </PreviewRoot>
  );
}
