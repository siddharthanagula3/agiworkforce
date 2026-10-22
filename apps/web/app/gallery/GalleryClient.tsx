'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/identity/client';
import {
  ChevronDown,
  CircleHelp,
  X,
  Code,
  LibraryBig,
  Plus,
  FileText,
  Globe,
  ListChecks,
  MonitorPlay,
  Palette,
  SquarePen,
  type Icon,
} from '@agiworkforce/icons';
import {
  useArtifactsStore,
  isGeneratedFileArtifactId,
} from '@/features/chat/stores/artifacts-store';
import type { Artifact } from '@/features/chat/stores/artifacts-store';
import { useArtifactIndex } from '@/features/chat/hooks/use-artifact-index';
import { ArtifactPreview } from '@/features/chat/components/artifacts/ArtifactPreview';
import type { ArtifactData } from '@/features/chat/components/artifacts/ArtifactPreview';
import { TypeIcon } from '@/features/chat/components/artifacts/artifact-labels';
import { Eyebrow, Prose } from '@/features/marketing/components/system';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  useDialogKeyboard,
} from '@agiworkforce/ui';
import { MermaidDiagram } from '@agiworkforce/unified-chat';
import { useMounted } from '@shared/hooks/useMounted';
import { escapeHTML } from '@shared/utils/html-sanitizer';
import { INSPIRATION, inspirationPath, type InspirationCard } from './inspiration';
import { useSharedWithYou } from './use-shared-with-you';

interface ArtifactCategory {
  id: string;
  label: string;
  icon: Icon;
  prompt: string;
}

const ARTIFACT_CATEGORIES: ArtifactCategory[] = [
  {
    id: 'apps',
    label: 'Apps and websites',
    icon: Globe,
    prompt: 'Build me a web app or website. ',
  },
  {
    id: 'documents',
    label: 'Documents',
    icon: FileText,
    prompt: 'Help me create a professional document. ',
  },
  {
    id: 'games',
    label: 'Games',
    icon: MonitorPlay,
    prompt: 'Build a simple browser game. ',
  },
  {
    id: 'productivity',
    label: 'Productivity tools',
    icon: ListChecks,
    prompt: 'Create a productivity tool or utility. ',
  },
  {
    id: 'creative',
    label: 'Creative projects',
    icon: Palette,
    prompt: 'Help me with a creative project. ',
  },
  {
    id: 'quiz',
    label: 'Quiz or survey',
    icon: CircleHelp,
    prompt: 'Build an interactive quiz or survey. ',
  },
  {
    id: 'scratch',
    label: 'Start from scratch',
    icon: SquarePen,
    prompt: '',
  },
];

function relativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function languageLabel(lang: string): string {
  const map: Record<string, string> = {
    ts: 'TypeScript',
    tsx: 'TypeScript',
    typescript: 'TypeScript',
    js: 'JavaScript',
    jsx: 'JavaScript',
    javascript: 'JavaScript',
    py: 'Python',
    python: 'Python',
    rust: 'Rust',
    go: 'Go',
    java: 'Java',
    rb: 'Ruby',
    ruby: 'Ruby',
    css: 'CSS',
    html: 'HTML',
    json: 'JSON',
    yaml: 'YAML',
    sql: 'SQL',
    sh: 'Shell',
    bash: 'Shell',
    swift: 'Swift',
    kotlin: 'Kotlin',
    dart: 'Dart',
    cpp: 'C++',
    csharp: 'C#',
    cs: 'C#',
    php: 'PHP',
    md: 'Markdown',
    markdown: 'Markdown',
    svg: 'SVG',
    mermaid: 'Mermaid',
    graphql: 'GraphQL',
  };
  return map[lang.toLowerCase()] ?? lang.charAt(0).toUpperCase() + lang.slice(1);
}

type TypeFilter = 'all' | ArtifactData['type'];
type DateFilter = 'all' | '7d' | '30d';

const DATE_WINDOW_MS: Record<Exclude<DateFilter, 'all'>, number> = {
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

const DATE_FILTER_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: 'all', label: 'Any time' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];

function matchesSearch(query: string, fields: (string | undefined)[]): boolean {
  if (!query) return true;
  return fields.some((field) => field?.toLowerCase().includes(query));
}

function NoMatchesState({ onClear }: { onClear: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-9) var(--space-5)',
        border: '1px dashed var(--agi-rule)',
        borderRadius: 'var(--corner-panel)',
        textAlign: 'center',
      }}
    >
      <LibraryBig size={32} color="var(--agi-ink-faint)" />
      <p
        style={{
          fontSize: 'var(--agi-text-md)',
          fontWeight: 500,
          color: 'var(--agi-ink-2)',
          margin: 0,
        }}
      >
        No artifacts match your search.
      </p>
      <button
        type="button"
        onClick={onClear}
        style={{
          fontSize: 'var(--agi-text-sm)',
          fontWeight: 600,
          color: 'var(--agi-ink)',
          textDecoration: 'underline',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          fontFamily: 'inherit',
        }}
      >
        Clear filters
      </button>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div
      style={{
        background: 'var(--agi-card)',
        border: '1px solid var(--agi-rule)',
        borderRadius: 'var(--corner-panel)',
        padding: 'var(--space-5) var(--space-5) var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      {/* Thumbnail placeholder */}
      <div
        style={{
          width: '100%',
          height: 120,
          borderRadius: 'var(--corner-field)',
          background: 'var(--agi-rule)',
          animation: 'agi-pulse 1.4s var(--curve-standard) infinite',
        }}
      />
      {/* Title row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
        <div
          style={{
            height: 14,
            width: '60%',
            borderRadius: 'var(--corner-control)',
            background: 'var(--agi-rule)',
            animation: 'agi-pulse 1.4s var(--curve-standard) infinite',
          }}
        />
        <div
          style={{
            height: 14,
            width: '20%',
            borderRadius: 'var(--corner-control)',
            background: 'var(--agi-rule)',
            animation: 'agi-pulse 1.4s var(--curve-standard) 0.2s infinite',
          }}
        />
      </div>
      {/* Subtitle */}
      <div
        style={{
          height: 12,
          width: '45%',
          borderRadius: 'var(--corner-control)',
          background: 'var(--agi-rule)',
          animation: 'agi-pulse 1.4s var(--curve-standard) 0.4s infinite',
        }}
      />
    </div>
  );
}

type ThumbnailKind = 'frame' | 'excerpt' | 'diagram' | 'icon';

const FRAMED_THUMBNAIL_TYPES: ReadonlyArray<ArtifactData['type']> = ['html', 'react', 'svg'];
const VIEWER_RENDERED_DOCUMENT_LANGUAGES = new Set(['md', 'mdx', 'markdown', 'pdf', 'docx', 'doc']);
const THUMBNAIL_SOURCE_LIMIT = 1200;
const EXCERPT_STYLE =
  'margin:0;overflow:hidden;font-family:ui-monospace,monospace;font-size:12px;line-height:1.5';

const SCALED_FRAME_STYLE: React.CSSProperties = {
  pointerEvents: 'none',
  width: '300%',
  height: '300%',
  transform: 'scale(0.333)',
  transformOrigin: 'top left',
  border: 'none',
};

const EXCERPT_FRAME_STYLE: React.CSSProperties = {
  pointerEvents: 'none',
  display: 'block',
  width: '100%',
  height: '100%',
  border: 'none',
};

function showsSourceInViewer(type: ArtifactData['type'], label: string): boolean {
  if (type === 'code') return true;
  if (type !== 'document') return false;
  const language = label.toLowerCase();
  const labelledByTypeAlone = language === type;
  return !labelledByTypeAlone && !VIEWER_RENDERED_DOCUMENT_LANGUAGES.has(language);
}

function thumbnailKind(
  type: ArtifactData['type'],
  label: string,
  content: string | undefined,
): ThumbnailKind {
  if (!content) return 'icon';
  if (FRAMED_THUMBNAIL_TYPES.includes(type)) return 'frame';
  if (type === 'mermaid') return 'diagram';
  return showsSourceInViewer(type, label) ? 'excerpt' : 'icon';
}

function thumbnailDocument(body: string): string {
  return `<html><head><meta charset="UTF-8"><style>body{margin:0;padding:6px;font-size:8px;overflow:hidden;background:#ffffff;color:#0d0d0d}*{max-width:100%}</style></head><body>${body}</body></html>`;
}

function excerptMarkup(source: string): string {
  return `<pre style="${EXCERPT_STYLE}">${escapeHTML(source)}</pre>`;
}

function ThumbnailIcon({ type }: { type: ArtifactData['type'] }) {
  return (
    <div
      data-testid="artifact-card-thumbnail-icon"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--agi-ink-quiet)',
      }}
    >
      <TypeIcon type={type} className="h-6 w-6" />
    </div>
  );
}

function DiagramThumbnail({ source }: { source: string }) {
  const mounted = useMounted();
  const [drawn, setDrawn] = useState(false);

  return (
    <>
      {drawn ? null : <ThumbnailIcon type="mermaid" />}
      {mounted ? (
        <div
          className="agi-gallery-diagram"
          data-testid="artifact-card-thumbnail-diagram"
          style={{
            position: 'absolute',
            inset: 0,
            padding: 'var(--space-3) var(--space-4) 0',
            background: 'var(--chat-bg)',
            visibility: drawn ? 'visible' : 'hidden',
          }}
        >
          <MermaidDiagram
            source={source}
            interactive={false}
            className="mermaid-block"
            onRenderResult={(result) => setDrawn(result !== null && 'svg' in result)}
          />
        </div>
      ) : null}
    </>
  );
}

interface ArtifactCardProps {
  title: string;
  language: string;
  subtitle: string;
  type: ArtifactData['type'];
  content?: string;
  onClick: () => void;
}

function ArtifactCard({ title, language, subtitle, type, content, onClick }: ArtifactCardProps) {
  const kind = thumbnailKind(type, language, content);
  const source = (content ?? '').slice(0, THUMBNAIL_SOURCE_LIMIT);

  return (
    <button
      type="button"
      onClick={onClick}
      className="agi-gallery-card"
      style={{
        background: 'var(--agi-card)',
        borderRadius: 'var(--corner-panel)',
        padding: '0',
        textAlign: 'start',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        width: '100%',
        overflow: 'hidden',
      }}
    >
      <div
        aria-hidden="true"
        data-testid="artifact-card-thumbnail"
        style={{
          width: '100%',
          height: 120,
          flexShrink: 0,
          overflow: 'hidden',
          background: 'var(--agi-bg-2)',
          position: 'relative',
          pointerEvents: 'none',
        }}
      >
        {kind === 'frame' || kind === 'excerpt' ? (
          <iframe
            title={`${title} preview`}
            // An aria-hidden, pointer-events-none thumbnail of the first 1200
            // characters. It has no reason to execute anything, and allowing
            // scripts meant every HTML artifact logged a CSP violation from
            // about:srcdoc, the srcdoc document inherits the script-src of the
            // page, which is 'self' plus a nonce this frame cannot carry.
            sandbox=""
            srcDoc={thumbnailDocument(kind === 'frame' ? source : excerptMarkup(source))}
            style={kind === 'frame' ? SCALED_FRAME_STYLE : EXCERPT_FRAME_STYLE}
            aria-hidden="true"
          />
        ) : null}
        {kind === 'diagram' ? <DiagramThumbnail source={content ?? ''} /> : null}
        {kind === 'icon' ? <ThumbnailIcon type={type} /> : null}
      </div>

      {/* Text area */}
      <div
        style={{
          padding: 'var(--space-4) var(--space-4) var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 'var(--space-2)',
          }}
        >
          <span
            style={{
              fontSize: 'var(--agi-text-sm)',
              fontWeight: 600,
              color: 'var(--agi-ink)',
              lineHeight: 1.35,
            }}
          >
            {title}
          </span>
          <span
            style={{
              fontSize: 'var(--agi-text-xs)',
              fontWeight: 500,
              color: 'var(--agi-ink-2)',
              background: 'var(--agi-bg-2)',
              border: '1px solid var(--agi-rule)',
              borderRadius: 'var(--corner-control)',
              padding: 'var(--space-1) var(--space-2)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {languageLabel(language)}
          </span>
        </div>
        <span
          style={{
            fontSize: 'var(--agi-text-xs)',
            color: 'var(--agi-ink-quiet)',
            lineHeight: 1.5,
          }}
        >
          {subtitle}
        </span>
      </div>
    </button>
  );
}

interface CategoryPickerProps {
  onClose: () => void;
  onSelect: (category: ArtifactCategory) => void;
}

function CategoryPicker({ onClose, onSelect }: CategoryPickerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  useDialogKeyboard({ open: true, onClose, panelRef });

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 'var(--z-modal)',
          background: 'rgba(0,0,0,0.55)',
        }}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Choose artifact type"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 'var(--z-modal)',
          width: 'min(560px, 92vw)',
          background: 'var(--agi-bg-2)',
          border: '1px solid var(--agi-rule-strong)',
          borderRadius: 'var(--corner-panel)',
          padding: 'var(--space-6) var(--space-6) var(--space-6)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-5)',
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: 'var(--agi-text-lg)',
              fontWeight: 700,
              color: 'var(--agi-ink)',
              letterSpacing: '-0.01em',
            }}
          >
            What do you want to create?
          </h2>
          <p
            style={{
              margin: 'var(--space-2) 0 0',
              fontSize: 'var(--agi-text-sm)',
              color: 'var(--agi-ink-quiet)',
            }}
          >
            Pick a starting point. You can describe the details next.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(152px, 1fr))',
            gap: 'var(--space-3)',
          }}
        >
          {ARTIFACT_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelect(cat)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 'var(--space-2)',
                padding: 'var(--space-4) var(--space-4) var(--space-3)',
                background: 'var(--agi-card)',
                border: '1px solid var(--agi-rule)',
                borderRadius: 'var(--corner-surface)',
                cursor: 'pointer',
                textAlign: 'start',
                transition: 'border-color 150ms',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--agi-ink)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--agi-rule)';
              }}
            >
              <cat.icon size={20} aria-hidden="true" style={{ color: 'var(--agi-ink)' }} />
              <span
                style={{
                  fontSize: 'var(--agi-text-sm)',
                  fontWeight: 600,
                  color: 'var(--agi-ink)',
                  lineHeight: 1.3,
                }}
              >
                {cat.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

const WIZARD_STEPS = [
  {
    step: 1,
    label: 'Describe your idea',
    placeholder: 'What should it do? Be as specific or brief as you like.',
  },
  { step: 2, label: 'Who is it for?', placeholder: 'e.g. just me, my team, end users...' },
  {
    step: 3,
    label: 'Any extra requirements?',
    placeholder: 'e.g. dark theme, no external libraries, mobile-friendly...',
  },
];

interface CreationWizardProps {
  category: ArtifactCategory;
  onClose: () => void;
  onLaunch: (prompt: string) => void;
}

function CreationWizard({ category, onClose, onLaunch }: CreationWizardProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>(['', '', '']);
  useDialogKeyboard({ open: true, onClose, panelRef });

  const step = WIZARD_STEPS[currentStep]!;
  const isLast = currentStep === WIZARD_STEPS.length - 1;

  const handleNext = () => {
    if (isLast) {
      const parts = [
        category.prompt,
        answers[0] ? answers[0] : '',
        answers[1] ? `For: ${answers[1]}` : '',
        answers[2] ? `Requirements: ${answers[2]}` : '',
      ].filter(Boolean);
      onLaunch(parts.join(' ').trim());
    } else {
      setCurrentStep((s) => s + 1);
    }
  };

  const handleSkip = () => {
    onLaunch(category.prompt.trim() || 'Start a new artifact.');
  };

  const updateAnswer = (val: string) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[currentStep] = val;
      return next;
    });
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 'var(--z-modal)',
          background: 'rgba(0,0,0,0.55)',
        }}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Create artifact"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 'var(--z-modal)',
          width: 'min(520px, 92vw)',
          background: 'var(--agi-bg-2)',
          border: '1px solid var(--agi-rule-strong)',
          borderRadius: 'var(--corner-panel)',
          padding: 'var(--space-6) var(--space-6) var(--space-6)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-5)',
        }}
      >
        {/* Header with step indicator */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <p
              style={{
                margin: '0 0 var(--space-1)',
                fontSize: 'var(--agi-text-xs)',
                color: 'var(--agi-ink-quiet)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Step {currentStep + 1} of {WIZARD_STEPS.length}, {category.label}
            </p>
            <h2
              style={{
                margin: 0,
                fontSize: 'var(--agi-text-lg)',
                fontWeight: 700,
                color: 'var(--agi-ink)',
                letterSpacing: '-0.01em',
              }}
            >
              {step.label}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close wizard"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--agi-ink-2)',
              padding: 'var(--space-1)',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Step dots */}
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {WIZARD_STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                height: 4,
                flex: 1,
                borderRadius: 'var(--corner-compact)',
                background: i <= currentStep ? 'var(--agi-ink)' : 'var(--agi-rule)',
                transition: 'background 200ms',
              }}
            />
          ))}
        </div>

        {/* Text input */}
        <textarea
          value={answers[currentStep] ?? ''}
          onChange={(e) => updateAnswer(e.target.value)}
          placeholder={step.placeholder}
          rows={4}
          autoFocus
          style={{
            width: '100%',
            padding: 'var(--space-3) var(--space-4)',
            background: 'var(--agi-card)',
            border: '1px solid var(--agi-rule)',
            borderRadius: 'var(--corner-menu)',
            color: 'var(--agi-ink)',
            fontSize: 'var(--agi-text-sm)',
            fontFamily: 'inherit',
            resize: 'vertical',
            outline: 'none',
            boxSizing: 'border-box',
          }}
          onFocus={(e) => {
            (e.target as HTMLTextAreaElement).style.borderColor = 'var(--agi-ink)';
          }}
          onBlur={(e) => {
            (e.target as HTMLTextAreaElement).style.borderColor = 'var(--agi-rule)';
          }}
        />

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            type="button"
            onClick={handleSkip}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: 'var(--agi-text-sm)',
              color: 'var(--agi-ink-quiet)',
              textDecoration: 'underline',
              padding: 0,
            }}
          >
            Skip and start now
          </button>
          <button
            type="button"
            onClick={handleNext}
            style={{
              padding: 'var(--space-2) var(--space-5)',
              background: 'var(--agi-ink)',
              border: 'none',
              borderRadius: 'var(--corner-menu)',
              color: 'var(--agi-bg)',
              fontSize: 'var(--agi-text-sm)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {isLast ? 'Create' : 'Next'}
          </button>
        </div>
      </div>
    </>
  );
}

interface ArtifactDrawerProps {
  artifact: Artifact | InspirationCard | null;
  onClose: () => void;
}

function ArtifactDrawer({ artifact, onClose }: ArtifactDrawerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  useDialogKeyboard({ open: artifact !== null, onClose, panelRef });

  if (!artifact) return null;

  const sourceConversationId = 'conversationId' in artifact ? artifact.conversationId : undefined;
  const previewArtifact = {
    id: artifact.id,
    type: artifact.type,
    language: artifact.language,
    title: artifact.title,
    content: artifact.content,
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 'var(--z-modal)',
          background: 'rgba(0,0,0,0.6)',
        }}
        aria-hidden="true"
      />
      {/* Panel */}
      <div
        ref={panelRef}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 'var(--z-modal)',
          width: 'min(680px, 92vw)',
          background: 'var(--agi-bg-2)',
          borderLeft: '1px solid var(--agi-rule-strong)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        role="dialog"
        aria-modal="true"
        aria-label={artifact.title ?? 'Artifact detail'}
      >
        {/* Panel header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            padding: 'var(--space-4) var(--space-5)',
            borderBottom: '1px solid var(--agi-rule)',
            flexShrink: 0,
          }}
        >
          <Code size={15} color="var(--agi-ink-quiet)" />
          <span
            style={{
              flex: 1,
              fontSize: 'var(--agi-text-sm)',
              fontWeight: 600,
              color: 'var(--agi-ink)',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {artifact.title}
          </span>
          <span
            style={{
              fontSize: 'var(--agi-text-xs)',
              fontWeight: 500,
              color: 'var(--agi-ink-2)',
              background: 'var(--agi-bg-2)',
              border: '1px solid var(--agi-rule)',
              borderRadius: 'var(--corner-control)',
              padding: 'var(--space-1) var(--space-2)',
            }}
          >
            {languageLabel(artifact.language)}
          </span>
          {INSPIRATION.some((card) => card.id === artifact.id) ? (
            <Link
              href={inspirationPath(artifact.id)}
              style={{
                fontSize: 'var(--agi-text-xs)',
                fontWeight: 500,
                color: 'var(--agi-ink)',
                textDecoration: 'underline',
                textUnderlineOffset: 3,
              }}
            >
              Open page
            </Link>
          ) : null}
          {sourceConversationId ? (
            <Link
              href={`/chat/${sourceConversationId}`}
              style={{
                fontSize: 'var(--agi-text-xs)',
                fontWeight: 500,
                color: 'var(--agi-ink-2)',
                border: '1px solid var(--agi-rule)',
                borderRadius: 'var(--corner-control)',
                padding: 'var(--space-1) var(--space-2)',
                textDecoration: 'none',
                flexShrink: 0,
              }}
            >
              Open chat
            </Link>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close artifact panel"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 'var(--corner-field)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--agi-ink-2)',
              flexShrink: 0,
            }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Panel body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-5)' }}>
          <ArtifactPreview artifact={previewArtifact} />
        </div>
      </div>
    </>
  );
}

function ScopeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={{
        minHeight: 36,
        padding: '0 var(--space-3)',
        borderRadius: 'var(--corner-field)',
        border: 'none',
        fontFamily: 'inherit',
        fontSize: 'var(--agi-text-sm)',
        fontWeight: 500,
        cursor: 'pointer',
        background: active ? 'var(--agi-bg-3)' : 'transparent',
        color: active ? 'var(--agi-ink)' : 'var(--agi-ink-quiet)',
        transition: 'background 150ms ease, color 150ms ease',
      }}
    >
      {children}
    </button>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 'var(--agi-text-md)',
        fontWeight: 500,
        color: 'var(--agi-ink-2)',
        margin: 'var(--space-8) 0 var(--space-4)',
      }}
    >
      {children}
    </h2>
  );
}

type ScopeId = 'all' | 'yours' | 'shared';

const SHARED_KIND_TYPES: Record<string, ArtifactData['type']> = {
  html: 'html',
  react: 'react',
  svg: 'svg',
  mermaid: 'mermaid',
  code: 'code',
  markdown: 'document',
  text: 'document',
};

interface SharedGalleryArtifact {
  token: string;
  title: string;
  type: ArtifactData['type'];
  updatedAt: Date;
}

function SharedArtifactGrid({
  artifacts,
  gridStyle,
  onOpen,
}: {
  artifacts: SharedGalleryArtifact[];
  gridStyle: React.CSSProperties;
  onOpen: (token: string) => void;
}) {
  return (
    <div style={gridStyle}>
      {artifacts.map((artifact) => (
        <ArtifactCard
          key={artifact.token}
          title={artifact.title}
          language={artifact.type}
          subtitle={`Updated ${relativeTime(artifact.updatedAt)}`}
          type={artifact.type}
          onClick={() => onOpen(artifact.token)}
        />
      ))}
    </div>
  );
}

function SharedNotice({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-9) var(--space-5)',
        textAlign: 'center',
      }}
    >
      <LibraryBig size={32} color="var(--agi-ink-faint)" />
      <p
        style={{
          fontSize: 'var(--agi-text-md)',
          fontWeight: 500,
          color: 'var(--agi-ink-2)',
          margin: 0,
        }}
      >
        {title}
      </p>
      {detail && (
        <p style={{ fontSize: 'var(--agi-text-sm)', color: 'var(--agi-ink-quiet)', margin: 0 }}>
          {detail}
        </p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="agi-ds-btn"
          style={{
            marginTop: 'var(--space-2)',
            borderRadius: 'var(--agi-radius-pill)',
            background: 'var(--agi-bg-3)',
            color: 'var(--agi-ink)',
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
type OverlayState =
  { kind: 'none' } | { kind: 'category' } | { kind: 'wizard'; category: ArtifactCategory };

/**
 * One row in the gallery grid: either a locally-derived artifact (has `content`
 * and a `local` handle, so it can open in the preview panel) or an index-only
 * row from another device's conversation (metadata only, opens the source
 * conversation, which re-derives it).
 */
interface GalleryArtifact {
  id: string;
  title: string;
  type: Artifact['type'];
  language?: string | undefined;
  content?: string | undefined;
  createdAt: Date;
  conversationId?: string | undefined;
  /** Present only when this device has the artifact derived locally. */
  local?: Artifact;
}

export interface GalleryClientProps {
  /**
   * Which chrome this instance is mounted inside.
   *
   * `marketing` (default) is the public `/gallery` route: Header + MarketingFooter
   * wrap it and the browser VIEWPORT is the scroll container, so a `100vh` floor
   * is exactly right.
   *
   * `app` is `/chat/artifacts`, which mounts this SAME component inside
   * `WebAppShell`. There the scroll container is the shell's content area, a
   * `fixed inset-0` flex child, shorter than the viewport whenever the shell
   * renders its narrow-viewport header, so a `100vh` floor overflows by the
   * header's height and leaves a dead scrollable band under the content.
   * Measured at 700x800: 800px of content in a 752px box.
   *
   * Two floors have to give way, not one. The inline `100vh` below is the
   * obvious one; globals.css also applies
   * `[data-design='agi']:not(.agi-chrome-band):not(.agi-modal-scope) { min-height: 100vh }`
   * to this component's own root. Both switch to `100%`, which resolves against
   * the shell's definite-height scroll box on the root (so `--agi-bg` still
   * paints the full content area rather than stopping at the last card).
   */
  chrome?: 'marketing' | 'app';
}

export function GalleryClient({ chrome = 'marketing' }: GalleryClientProps) {
  const router = useRouter();
  const [scope, setScope] = useState<ScopeId>('all');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [mounted, setMounted] = useState(false);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | InspirationCard | null>(null);
  const [overlay, setOverlay] = useState<OverlayState>({ kind: 'none' });
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (chrome !== 'app') return;
    if (typeof window.matchMedia !== 'function') return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    searchInputRef.current?.focus();
  }, [chrome]);

  const { isLoaded: authLoaded, isSignedIn } = useSession();
  const artifacts = useArtifactsStore((s) => s.artifacts);
  const { artifacts: indexedArtifacts, loaded: indexLoaded } = useArtifactIndex();

  /**
   * The gallery's set = locally-derived artifacts ⊕ the account-wide index.
   *
   * Web derives artifacts from message markdown at render time, so the local
   * store only covers conversations THIS device has opened. The index
   * (migration 0120) covers the account. They share the same deterministic ids,
   * so merging is by identity, no reconciliation.
   *
   * Local wins on collision: it carries real `content`, which is what lets a
   * card render a live thumbnail and open in the preview panel. An index-only
   * row has no content by design (the index stores none), so it renders as a
   * card without a thumbnail and opens its source conversation, where it is
   * re-derived in full.
   */
  const sortedArtifacts = useMemo(() => {
    const byId = new Map<string, GalleryArtifact>();
    for (const a of indexedArtifacts) {
      byId.set(a.id, {
        id: a.id,
        title: a.title ?? 'Untitled artifact',
        type: a.type as Artifact['type'],
        language: a.language ?? undefined,
        content: undefined,
        createdAt: new Date(a.createdAt),
        conversationId: a.conversationId,
      });
    }
    for (const a of artifacts) {
      // `genfile-<assetId>` rows are tool-generated FILES that Library already
      // lists under `<assetId>`. Listing them here too would put one file in
      // two places under two ids that can never dedupe.
      if (isGeneratedFileArtifactId(a.id)) continue;
      byId.set(a.id, {
        id: a.id,
        title: a.title,
        type: a.type,
        language: a.language,
        content: a.content,
        createdAt: a.createdAt,
        conversationId: a.conversationId,
        local: a,
      });
    }
    return [...byId.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }, [artifacts, indexedArtifacts]);

  const shared = useSharedWithYou();
  const activeScope: ScopeId = scope === 'shared' && isSignedIn !== true ? 'all' : scope;

  const sharedArtifacts = useMemo<SharedGalleryArtifact[]>(
    () =>
      shared.items.map((item) => ({
        token: item.token,
        title: item.title || 'Untitled artifact',
        type: SHARED_KIND_TYPES[item.kind] ?? 'document',
        updatedAt: new Date(item.updatedAt),
      })),
    [shared.items],
  );

  const yoursLoading = !mounted || !authLoaded || (isSignedIn === true && !indexLoaded);

  const normalizedQuery = query.trim().toLowerCase();

  const visibleArtifacts = useMemo(() => {
    const window = dateFilter === 'all' ? null : DATE_WINDOW_MS[dateFilter];
    const cutoff = window === null ? null : Date.now() - window;
    return sortedArtifacts.filter((artifact) => {
      if (typeFilter !== 'all' && artifact.type !== typeFilter) return false;
      if (cutoff !== null && artifact.createdAt.getTime() < cutoff) return false;
      return matchesSearch(normalizedQuery, [artifact.title, artifact.language, artifact.type]);
    });
  }, [sortedArtifacts, normalizedQuery, typeFilter, dateFilter]);

  const visibleShared = useMemo(() => {
    const window = dateFilter === 'all' ? null : DATE_WINDOW_MS[dateFilter];
    const cutoff = window === null ? null : Date.now() - window;
    return sharedArtifacts.filter((artifact) => {
      if (typeFilter !== 'all' && artifact.type !== typeFilter) return false;
      if (cutoff !== null && artifact.updatedAt.getTime() < cutoff) return false;
      return matchesSearch(normalizedQuery, [artifact.title, artifact.type]);
    });
  }, [sharedArtifacts, normalizedQuery, typeFilter, dateFilter]);

  const visibleInspiration = useMemo(
    () =>
      INSPIRATION.filter((card) => {
        if (dateFilter !== 'all') return false;
        if (typeFilter !== 'all' && card.type !== typeFilter) return false;
        return matchesSearch(normalizedQuery, [
          card.title,
          card.language,
          card.type,
          card.description,
        ]);
      }),
    [normalizedQuery, typeFilter, dateFilter],
  );

  const typesInScope = (target: ScopeId): ArtifactData['type'][] => {
    const source: ArtifactData['type'][] = [];
    if (target !== 'shared') source.push(...sortedArtifacts.map((a) => a.type));
    if (target === 'all') source.push(...INSPIRATION.map((c) => c.type));
    if (target !== 'yours') source.push(...sharedArtifacts.map((a) => a.type));
    return [...new Set(source)].sort();
  };

  const typeOptions = typesInScope(activeScope);

  const filterSummary =
    [
      typeFilter === 'all' ? null : languageLabel(typeFilter),
      dateFilter === 'all'
        ? null
        : (DATE_FILTER_OPTIONS.find((option) => option.value === dateFilter)?.label ?? null),
    ]
      .filter(Boolean)
      .join(', ') || 'All';

  const filtersActive = normalizedQuery !== '' || typeFilter !== 'all' || dateFilter !== 'all';

  const clearFilters = () => {
    setQuery('');
    setTypeFilter('all');
    setDateFilter('all');
  };

  const selectScope = (next: ScopeId) => {
    setScope(next);
    if (typeFilter !== 'all' && !typesInScope(next).includes(typeFilter)) {
      setTypeFilter('all');
    }
  };

  const handleCategorySelect = (category: ArtifactCategory) => {
    if (category.id === 'scratch') {
      router.push('/chat');
      return;
    }
    setOverlay({ kind: 'wizard', category });
  };

  const openShared = (token: string) => {
    router.push(`/shared-artifact/${encodeURIComponent(token)}`);
  };

  const handleLaunch = (prompt: string) => {
    const encoded = encodeURIComponent(prompt);
    router.push(`/chat?starterPrompt=${encoded}`);
  };

  const cardGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 'var(--space-4)',
  };

  return (
    <div data-design="agi" style={chrome === 'app' ? { minHeight: '100%' } : undefined}>
      {/* Pulse keyframes injected inline once */}
      <style>{`
        @keyframes agi-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .agi-gallery-card {
          border: 1px solid var(--agi-rule);
          transition: border-color var(--agi-dur-hover) var(--curve-standard);
        }
        .agi-gallery-card:hover,
        .agi-gallery-card:focus-visible {
          border-color: var(--agi-rule-strong);
        }
        .agi-gallery-diagram .mermaid-block {
          margin: 0;
        }
        .agi-gallery-diagram .mermaid-diagram svg {
          margin-inline: auto;
        }
      `}</style>

      <div
        style={{
          minHeight: chrome === 'app' ? '100%' : '100vh',
          background: 'var(--agi-bg)',
          color: 'var(--agi-ink)',
        }}
      >
        {/* Page header */}
        <div className="agi-ds-container" style={{ paddingTop: 'var(--space-8)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-4)',
              flexWrap: 'wrap',
              marginBottom: 'var(--space-2)',
            }}
          >
            <div>
              <Eyebrow>Gallery</Eyebrow>
              <h1 className="agi-ds-h1">Artifacts</h1>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="agi-ds-btn"
                    aria-label={`Filter by: ${filterSummary}`}
                    style={{ background: 'var(--agi-bg-3)', color: 'var(--agi-ink)' }}
                  >
                    <span style={{ color: 'var(--agi-ink-quiet)' }}>Filter by</span>
                    <span>{filterSummary}</span>
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[200px]">
                  <DropdownMenuLabel>Type</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={typeFilter}
                    onValueChange={(value) => setTypeFilter(value as TypeFilter)}
                  >
                    <DropdownMenuRadioItem value="all">All types</DropdownMenuRadioItem>
                    {typeOptions.map((type) => (
                      <DropdownMenuRadioItem key={type} value={type}>
                        {languageLabel(type)}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Created</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={dateFilter}
                    onValueChange={(value) => setDateFilter(value as DateFilter)}
                  >
                    {DATE_FILTER_OPTIONS.map((option) => (
                      <DropdownMenuRadioItem key={option.value} value={option.value}>
                        {option.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <button
                type="button"
                onClick={() => setOverlay({ kind: 'category' })}
                className="agi-ds-btn"
                data-variant="primary"
              >
                <Plus size={14} aria-hidden="true" />
                New artifact
              </button>
            </div>
          </div>

          <div style={{ marginBottom: 'var(--space-6)' }}>
            <Prose>
              Browse artifacts you have built in conversations, or explore curated examples to spark
              your next idea.
            </Prose>
          </div>

          <div
            className="agi-ds-form-row"
            style={{ alignItems: 'center', marginBottom: 'var(--space-4)' }}
          >
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search artifacts..."
              aria-label="Search artifacts"
              className="agi-ds-input"
              style={{ flex: '1 1 240px', minWidth: 200, boxSizing: 'border-box' }}
            />
            {filtersActive && (
              <button
                type="button"
                onClick={clearFilters}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 'var(--agi-text-sm)',
                  color: 'var(--agi-ink-quiet)',
                  textDecoration: 'underline',
                  padding: 0,
                }}
              >
                Clear filters
              </button>
            )}
          </div>

          <div
            role="group"
            aria-label="Show artifacts"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-1)',
              marginBottom: 'var(--space-6)',
            }}
          >
            <ScopeButton active={activeScope === 'all'} onClick={() => selectScope('all')}>
              All
            </ScopeButton>
            <ScopeButton active={activeScope === 'yours'} onClick={() => selectScope('yours')}>
              Yours
            </ScopeButton>
            {isSignedIn === true && (
              <ScopeButton active={activeScope === 'shared'} onClick={() => selectScope('shared')}>
                Shared with you
              </ScopeButton>
            )}
          </div>
        </div>

        <div className="agi-ds-container" style={{ paddingBottom: 'var(--space-9)' }}>
          {activeScope === 'shared' ? (
            !shared.loaded ? (
              <div style={cardGridStyle}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            ) : shared.error && sharedArtifacts.length === 0 ? (
              <SharedNotice
                title={shared.error}
                action={{ label: 'Try again', onClick: shared.retry }}
              />
            ) : !shared.emailVerified ? (
              <SharedNotice
                title="Verify your email to see artifacts shared with you."
                detail="Sharing matches the confirmed email on your account."
              />
            ) : sharedArtifacts.length === 0 ? (
              <SharedNotice
                title="Artifacts people share with you will appear here."
                detail="When someone invites your email to a published artifact, it shows up here."
              />
            ) : visibleShared.length === 0 && !shared.hasMore ? (
              <NoMatchesState onClear={clearFilters} />
            ) : (
              <>
                <SharedArtifactGrid
                  artifacts={visibleShared}
                  gridStyle={cardGridStyle}
                  onOpen={openShared}
                />
                {shared.error && (
                  <p
                    role="alert"
                    style={{
                      fontSize: 'var(--agi-text-sm)',
                      color: 'var(--agi-ink-quiet)',
                      margin: 'var(--space-4) 0 0',
                      textAlign: 'center',
                    }}
                  >
                    {shared.error}
                  </p>
                )}
                {shared.hasMore && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      marginTop: 'var(--space-6)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={shared.loadMore}
                      disabled={shared.loadingMore}
                      aria-busy={shared.loadingMore}
                      className="agi-ds-btn"
                      style={{
                        borderRadius: 'var(--agi-radius-pill)',
                        background: 'var(--agi-bg-3)',
                        color: 'var(--agi-ink)',
                      }}
                    >
                      {shared.loadingMore ? 'Loading...' : 'Load more'}
                    </button>
                  </div>
                )}
              </>
            )
          ) : yoursLoading ? (
            <div style={cardGridStyle}>
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : sortedArtifacts.length === 0 && !filtersActive ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--space-3)',
                padding: 'var(--space-9) var(--space-5)',
                textAlign: 'center',
              }}
            >
              <LibraryBig size={32} color="var(--agi-ink-faint)" />
              <p
                style={{
                  fontSize: 'var(--agi-text-md)',
                  fontWeight: 500,
                  color: 'var(--agi-ink-2)',
                  margin: 0,
                }}
              >
                Artifacts you create in conversations will appear here.
              </p>
              <p
                style={{
                  fontSize: 'var(--agi-text-sm)',
                  color: 'var(--agi-ink-quiet)',
                  margin: 0,
                }}
              >
                Try asking AGI to build an HTML component, write a script, or create a diagram.
              </p>
              <button
                type="button"
                onClick={() => setOverlay({ kind: 'category' })}
                className="agi-ds-btn"
                data-testid="gallery-empty-new-artifact"
                style={{
                  marginTop: 'var(--space-2)',
                  borderRadius: 'var(--agi-radius-pill)',
                  background: 'var(--agi-bg-3)',
                  color: 'var(--agi-ink)',
                }}
              >
                New artifact
              </button>
            </div>
          ) : visibleArtifacts.length === 0 &&
            (activeScope === 'yours' ||
              (visibleInspiration.length === 0 && visibleShared.length === 0)) ? (
            <NoMatchesState onClear={clearFilters} />
          ) : visibleArtifacts.length > 0 ? (
            <div style={cardGridStyle}>
              {visibleArtifacts.map((artifact) => (
                <ArtifactCard
                  key={artifact.id}
                  title={artifact.title}
                  language={artifact.language ?? artifact.type}
                  subtitle={`Created ${relativeTime(artifact.createdAt)}`}
                  type={artifact.type}
                  content={artifact.content}
                  onClick={() => {
                    if (artifact.local) {
                      setSelectedArtifact(artifact.local);
                      return;
                    }
                    if (artifact.conversationId) {
                      router.push(`/chat/${artifact.conversationId}`);
                    }
                  }}
                />
              ))}
            </div>
          ) : null}

          {activeScope === 'all' && visibleShared.length > 0 && (
            <section aria-label="Shared with you">
              <SectionHeading>Shared with you</SectionHeading>
              <SharedArtifactGrid
                artifacts={visibleShared}
                gridStyle={cardGridStyle}
                onOpen={openShared}
              />
            </section>
          )}

          {activeScope === 'all' && visibleInspiration.length > 0 && (
            <section aria-label="Inspiration">
              <SectionHeading>Inspiration</SectionHeading>
              <div style={cardGridStyle}>
                {visibleInspiration.map((card) => (
                  <ArtifactCard
                    key={card.id}
                    title={card.title}
                    language={card.language}
                    subtitle={card.description}
                    type={card.type}
                    content={card.content}
                    onClick={() => setSelectedArtifact(card)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Artifact detail drawer */}
      {selectedArtifact && (
        <ArtifactDrawer artifact={selectedArtifact} onClose={() => setSelectedArtifact(null)} />
      )}

      {/* Category picker */}
      {overlay.kind === 'category' && (
        <CategoryPicker
          onClose={() => setOverlay({ kind: 'none' })}
          onSelect={handleCategorySelect}
        />
      )}

      {/* Creation wizard */}
      {overlay.kind === 'wizard' && (
        <CreationWizard
          category={overlay.category}
          onClose={() => setOverlay({ kind: 'none' })}
          onLaunch={handleLaunch}
        />
      )}
    </div>
  );
}
