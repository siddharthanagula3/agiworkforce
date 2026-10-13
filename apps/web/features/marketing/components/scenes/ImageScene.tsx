import './ImageScene.css';
import {
  AudioLines,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Image as ImageIcon,
  Mic,
  MoreHorizontal,
  Pencil,
  Plus,
  Share2,
  X,
} from 'lucide-react';
import { supportsManagedMediaImageEdit } from '@agiworkforce/cloud-contracts';
import {
  getImageAspectOptionsForModel,
  IMAGE_MODELS,
  IMAGE_STYLE_PRESETS,
} from '@/features/chat/lib/imageGenerationOptions';
import { AppSidebar, PreviewRoot, TrafficLights } from '../app-preview/AppPreviews';

const SCENE_CHATS = ['Image generation', 'Weekly plan', 'Release notes'];
const SCENE_SUBJECT = 'A paper boat on a calm lake';
const SCENE_STYLE = IMAGE_STYLE_PRESETS.find((preset) => preset.id === 'line-art');
const SCENE_VERSIONS = { shown: 2, total: 2 } as const;

export const IMAGE_SCENE_PROMPT = SCENE_STYLE
  ? `${SCENE_SUBJECT}, ${SCENE_STYLE.phrase}`
  : SCENE_SUBJECT;

export const IMAGE_SCENE_MODEL =
  IMAGE_MODELS.find((model) => supportsManagedMediaImageEdit(model.imageApi)) ?? IMAGE_MODELS[0];

const SCENE_EDITS = supportsManagedMediaImageEdit(IMAGE_SCENE_MODEL?.imageApi);
const SCENE_ASPECT = getImageAspectOptionsForModel(IMAGE_SCENE_MODEL?.id)[0];
const SCENE_CAPTION = IMAGE_SCENE_MODEL ? `Generated with ${IMAGE_SCENE_MODEL.label}` : null;

function PaperBoat() {
  return (
    <svg
      className="agi-image-art"
      viewBox="0 0 300 200"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="244" cy="42" r="14" />
      <path d="M20 98q32-16 64 0M222 98q29-12 58 0" />
      <path d="M70 108l58 14 22-60 22 60 58-14-34 42h-92z" />
      <path d="M128 122h44M150 62v60" />
      <path d="M24 150h56M220 150h56M40 166h220M76 178h148M112 190h76" />
    </svg>
  );
}

function ImageCard() {
  return (
    <div className="agi-image-card">
      <div className="agi-image-frame">
        <PaperBoat />
        <span className="agi-image-overlay">
          <span className="agi-image-chip">
            <Pencil className="agi-app-icon agi-app-icon--sm" />
            New version
          </span>
          <span className="agi-image-chip" data-round="true">
            <Share2 className="agi-app-icon" />
          </span>
        </span>
      </div>
      <div className="agi-image-actions">
        <span className="agi-image-action">
          <Copy className="agi-image-icon" />
          Copy
        </span>
        <span className="agi-image-action" data-square="true">
          <MoreHorizontal className="agi-app-icon" />
        </span>
        <span className="agi-image-versions">
          <span className="agi-image-action" data-square="true">
            <ChevronLeft className="agi-image-icon" />
          </span>
          <span className="agi-image-count">
            {SCENE_VERSIONS.shown} / {SCENE_VERSIONS.total}
          </span>
          <span
            className="agi-image-action"
            data-square="true"
            data-idle={SCENE_VERSIONS.shown === SCENE_VERSIONS.total ? 'true' : undefined}
          >
            <ChevronRight className="agi-image-icon" />
          </span>
        </span>
        {SCENE_CAPTION ? (
          <span className="agi-image-caption agi-app-end">{SCENE_CAPTION}</span>
        ) : null}
      </div>
    </div>
  );
}

function ImageComposer() {
  return (
    <div className="agi-app-composer agi-image-composer">
      <span className="agi-app-placeholder">Describe or edit an image</span>
      <div className="agi-app-composer-row">
        <Plus className="agi-app-icon agi-app-icon--lg" />
        <span className="agi-image-pills">
          <span className="agi-image-pill" data-on="true">
            <ImageIcon className="agi-app-icon" />
            Image
            <X className="agi-app-icon agi-app-quiet" />
          </span>
          {SCENE_ASPECT ? (
            <span className="agi-image-pill">
              {SCENE_ASPECT.label}
              <ChevronDown className="agi-app-icon" />
            </span>
          ) : null}
          <span className="agi-image-pill">
            Style
            <ChevronDown className="agi-app-icon" />
          </span>
          {SCENE_EDITS ? <span className="agi-image-pill">Transparent</span> : null}
        </span>
        {IMAGE_SCENE_MODEL ? (
          <span className="agi-image-pill agi-app-end">
            <span className="agi-image-model">{IMAGE_SCENE_MODEL.label}</span>
            <ChevronDown className="agi-app-icon" />
          </span>
        ) : null}
        <Mic className="agi-app-icon agi-app-icon--lg" />
        <span className="agi-app-send">
          <AudioLines className="agi-app-icon" />
        </span>
      </div>
    </div>
  );
}

export function ImageScene() {
  return (
    <PreviewRoot kind="web" scene="image" label="Authored example of a generated image in a chat">
      <div className="agi-app-chrome">
        <TrafficLights />
        <span className="agi-app-url">agiworkforce.com/chat</span>
      </div>
      <div className="agi-app-shell">
        <AppSidebar chats={SCENE_CHATS} />
        <div className="agi-app-main">
          <div className="agi-app-thread">
            <p className="agi-app-user">{IMAGE_SCENE_PROMPT}</p>
            <div className="agi-app-reply">
              <ImageCard />
            </div>
          </div>
          <ImageComposer />
        </div>
      </div>
    </PreviewRoot>
  );
}
