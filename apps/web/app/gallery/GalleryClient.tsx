'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/identity/client';
import { X, Code, Layers, Plus } from 'lucide-react';
import {
  useArtifactsStore,
  isGeneratedFileArtifactId,
} from '@/features/chat/stores/artifacts-store';
import type { Artifact } from '@/features/chat/stores/artifacts-store';
import { useArtifactIndex } from '@/features/chat/hooks/use-artifact-index';
import { ArtifactPreview } from '@/features/chat/components/artifacts/ArtifactPreview';
import type { ArtifactData } from '@/features/chat/components/artifacts/ArtifactPreview';
import { Eyebrow, Prose } from '@/features/marketing/components/system';

// ---------------------------------------------------------------------------
// Inspiration examples (curated, static)
// ---------------------------------------------------------------------------

interface InspirationCard {
  id: string;
  title: string;
  language: string;
  description: string;
  type: 'html' | 'react' | 'svg' | 'mermaid' | 'code' | 'document';
  content: string;
}

const INSPIRATION: InspirationCard[] = [
  {
    id: 'insp-1',
    title: 'Animated gradient button',
    language: 'html',
    type: 'html',
    description: 'A self-contained HTML snippet with CSS keyframe animation.',
    content: `<style>
  body { margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #171813; }
  .btn {
    padding: 14px 32px;
    font-size: 15px;
    font-weight: 600;
    border: none;
    border-radius: 10px;
    background: linear-gradient(135deg, #a98248, #d1b27a, #a98248);
    background-size: 200% 200%;
    color: #24231e;
    cursor: pointer;
    animation: shift 3s ease infinite;
    font-family: system-ui, sans-serif;
  }
  @keyframes shift { 0%,100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
</style>
<button class="btn">Get started</button>`,
  },
  {
    id: 'insp-2',
    title: 'Flow chart: CI pipeline',
    language: 'mermaid',
    type: 'mermaid',
    description: 'Mermaid diagram showing a typical CI/CD pipeline.',
    content: `graph TD
  A[Push to branch] --> B{Lint + typecheck}
  B -->|Pass| C[Unit tests]
  B -->|Fail| Z[Block PR]
  C -->|Pass| D[Build]
  D --> E[Preview deploy]
  E --> F{Review}
  F -->|Approved| G[Merge to main]
  G --> H[Production deploy]`,
  },
  {
    id: 'insp-3',
    title: 'SVG logo placeholder',
    language: 'svg',
    type: 'svg',
    description: 'A clean SVG wordmark built without any assets.',
    content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60" width="200" height="60">
  <rect width="200" height="60" rx="8" fill="#1a1b17"/>
  <text x="20" y="38" font-family="Georgia, serif" font-size="26" font-weight="700" fill="#b9985c">AGI</text>
  <text x="72" y="38" font-family="Georgia, serif" font-size="26" font-weight="400" fill="#e7e0d2"> Workforce</text>
</svg>`,
  },
  {
    id: 'insp-4',
    title: 'Python data pipeline',
    language: 'python',
    type: 'code',
    description: 'Skeleton for an async data ingestion pipeline.',
    content: `import asyncio
from dataclasses import dataclass, field
from typing import AsyncIterator

@dataclass
class Record:
    id: str
    payload: dict
    tags: list[str] = field(default_factory=list)

async def fetch_records(source: str) -> AsyncIterator[Record]:
    """Yield records from source -- replace with real I/O."""
    for i in range(5):
        await asyncio.sleep(0.1)
        yield Record(id=f"{source}-{i}", payload={"index": i})

async def process(records: AsyncIterator[Record]) -> list[Record]:
    out = []
    async for r in records:
        r.tags.append("processed")
        out.append(r)
    return out

async def main():
    records = fetch_records("demo")
    result = await process(records)
    print(f"Processed {len(result)} records")

asyncio.run(main())`,
  },
  {
    id: 'insp-5',
    title: 'Responsive card grid (HTML)',
    language: 'html',
    type: 'html',
    description: 'Auto-filling card grid with CSS Grid and media queries.',
    content: `<style>
  body { margin: 0; padding: 24px; background: #171813; font-family: system-ui, sans-serif; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 16px; }
  .card {
    background: #1a1b17;
    border: 1px solid rgba(226,220,207,0.12);
    border-radius: 12px;
    padding: 20px 16px;
    color: #e7e0d2;
    font-size: 13px;
  }
  .card h3 { margin: 0 0 6px; font-size: 15px; color: #b9985c; }
  .card p  { margin: 0; color: #c8c0b2; line-height: 1.5; }
</style>
<div class="grid">
  <div class="card"><h3>Speed</h3><p>Sub-100 ms first token on most models.</p></div>
  <div class="card"><h3>Routing</h3><p>Auto-selects the best provider per task.</p></div>
  <div class="card"><h3>Privacy</h3><p>Local mode keeps data on your device.</p></div>
  <div class="card"><h3>Open</h3><p>BYOK or use your own Ollama instance.</p></div>
</div>`,
  },
  {
    id: 'insp-6',
    title: 'SQL schema: user accounts',
    language: 'sql',
    type: 'code',
    description: 'Postgres DDL for a simple multi-tenant accounts table.',
    content: `-- user_accounts.sql
CREATE TABLE accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  name        TEXT,
  tier        TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free','hobby','pro','max','enterprise')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_accounts_email ON accounts (email);

CREATE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();`,
  },
];

// ---------------------------------------------------------------------------
// Category picker data (Fix 35)
// ---------------------------------------------------------------------------

interface ArtifactCategory {
  id: string;
  label: string;
  icon: string;
  prompt: string;
}

const ARTIFACT_CATEGORIES: ArtifactCategory[] = [
  {
    id: 'apps',
    label: 'Apps and websites',
    icon: '🌐',
    prompt: 'Build me a web app or website. ',
  },
  {
    id: 'documents',
    label: 'Documents',
    icon: '📄',
    prompt: 'Help me create a professional document. ',
  },
  {
    id: 'games',
    label: 'Games',
    icon: '🎮',
    prompt: 'Build a simple browser game. ',
  },
  {
    id: 'productivity',
    label: 'Productivity tools',
    icon: '⚡',
    prompt: 'Create a productivity tool or utility. ',
  },
  {
    id: 'creative',
    label: 'Creative projects',
    icon: '✨',
    prompt: 'Help me with a creative project. ',
  },
  {
    id: 'quiz',
    label: 'Quiz or survey',
    icon: '📝',
    prompt: 'Build an interactive quiz or survey. ',
  },
  {
    id: 'scratch',
    label: 'Start from scratch',
    icon: '🔲',
    prompt: '',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Search + filters
// ---------------------------------------------------------------------------

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
        gap: 12,
        padding: '80px 24px',
        border: '1px dashed var(--agi-rule)',
        borderRadius: 16,
        textAlign: 'center',
      }}
    >
      <Layers size={32} color="var(--agi-ink-faint)" />
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

// ---------------------------------------------------------------------------
// Skeleton card (Fix 38)
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <div
      style={{
        background: 'var(--agi-card)',
        border: '1px solid var(--agi-rule)',
        borderRadius: 14,
        padding: '20px 20px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {/* Thumbnail placeholder */}
      <div
        style={{
          width: '100%',
          height: 120,
          borderRadius: 8,
          background: 'var(--agi-rule)',
          animation: 'agi-pulse 1.4s ease-in-out infinite',
        }}
      />
      {/* Title row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <div
          style={{
            height: 14,
            width: '60%',
            borderRadius: 6,
            background: 'var(--agi-rule)',
            animation: 'agi-pulse 1.4s ease-in-out infinite',
          }}
        />
        <div
          style={{
            height: 14,
            width: '20%',
            borderRadius: 6,
            background: 'var(--agi-rule)',
            animation: 'agi-pulse 1.4s ease-in-out 0.2s infinite',
          }}
        />
      </div>
      {/* Subtitle */}
      <div
        style={{
          height: 12,
          width: '45%',
          borderRadius: 6,
          background: 'var(--agi-rule)',
          animation: 'agi-pulse 1.4s ease-in-out 0.4s infinite',
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card (Fix 34: iframe thumbnail for renderable types)
// ---------------------------------------------------------------------------

interface ArtifactCardProps {
  title: string;
  language: string;
  subtitle: string;
  type?: ArtifactData['type'];
  content?: string;
  onClick: () => void;
}

function ArtifactCard({ title, language, subtitle, type, content, onClick }: ArtifactCardProps) {
  const canRender = type && content && ['html', 'react', 'svg', 'mermaid'].includes(type);

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'var(--agi-card)',
        border: '1px solid var(--agi-rule)',
        borderRadius: 14,
        padding: '0',
        textAlign: 'left',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        transition: 'border-color 200ms ease',
        width: '100%',
        overflow: 'hidden',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--agi-rule-strong)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--agi-rule)';
      }}
    >
      {/* Rendered thumbnail (Fix 34) */}
      {canRender && (
        <div
          style={{
            width: '100%',
            height: 120,
            overflow: 'hidden',
            background: 'var(--agi-card)',
            position: 'relative',
          }}
        >
          <iframe
            title={`${title} preview`}
            // A 33%-scaled, aria-hidden, pointer-events-none thumbnail of the
            // first 1200 characters. It has no reason to execute anything, and
            // allowing scripts meant every HTML artifact logged a CSP violation
            // from about:srcdoc, the srcdoc document inherits the page's
            // script-src, which is 'self' plus a nonce this frame cannot carry.
            sandbox=""
            srcDoc={`<html><head><meta charset="UTF-8"><style>body{margin:0;padding:6px;font-size:8px;overflow:hidden;background:#f8f5ee;color:#39362e}*{max-width:100%}</style></head><body>${(content ?? '').slice(0, 1200)}</body></html>`}
            style={{
              pointerEvents: 'none',
              width: '300%',
              height: '300%',
              transform: 'scale(0.333)',
              transformOrigin: 'top left',
              border: 'none',
            }}
            aria-hidden="true"
          />
        </div>
      )}

      {/* Text area */}
      <div
        style={{
          padding: '14px 18px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 8,
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
              borderRadius: 6,
              padding: '2px 7px',
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

// ---------------------------------------------------------------------------
// Category picker overlay (Fix 35)
// ---------------------------------------------------------------------------

interface CategoryPickerProps {
  onClose: () => void;
  onSelect: (category: ArtifactCategory) => void;
}

function CategoryPicker({ onClose, onSelect }: CategoryPickerProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

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
          borderRadius: 18,
          padding: '32px 28px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
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
              margin: '6px 0 0',
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
            gap: 10,
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
                gap: 6,
                padding: '14px 14px 12px',
                background: 'var(--agi-card)',
                border: '1px solid var(--agi-rule)',
                borderRadius: 12,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'border-color 150ms',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--agi-ink)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--agi-rule)';
              }}
            >
              <span style={{ fontSize: 'var(--agi-text-lg)' }}>{cat.icon}</span>
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

// ---------------------------------------------------------------------------
// Creation wizard (Fix 36)
// ---------------------------------------------------------------------------

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
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>(['', '', '']);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

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
          borderRadius: 18,
          padding: '32px 28px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        {/* Header with step indicator */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <p
              style={{
                margin: '0 0 4px',
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
              padding: 4,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Step dots */}
        <div style={{ display: 'flex', gap: 6 }}>
          {WIZARD_STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                height: 4,
                flex: 1,
                borderRadius: 4,
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
            padding: '12px 14px',
            background: 'var(--agi-card)',
            border: '1px solid var(--agi-rule)',
            borderRadius: 10,
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
              padding: '9px 22px',
              background: 'var(--agi-ink)',
              border: 'none',
              borderRadius: 9,
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

// ---------------------------------------------------------------------------
// Detail drawer (right-side panel)
// ---------------------------------------------------------------------------

interface ArtifactDrawerProps {
  artifact: Artifact | InspirationCard | null;
  onClose: () => void;
}

function ArtifactDrawer({ artifact, onClose }: ArtifactDrawerProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!artifact) return null;

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
            gap: 10,
            padding: '14px 20px',
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
              borderRadius: 6,
              padding: '2px 7px',
            }}
          >
            {languageLabel(artifact.language)}
          </span>
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
              borderRadius: 8,
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
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          <ArtifactPreview artifact={previewArtifact} />
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Tab button
// ---------------------------------------------------------------------------

function TabButton({
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
      onClick={onClick}
      style={{
        padding: '6px 16px',
        borderRadius: 8,
        border: 'none',
        fontFamily: 'inherit',
        fontSize: 'var(--agi-text-sm)',
        fontWeight: 500,
        cursor: 'pointer',
        background: active ? 'var(--agi-ink)' : 'transparent',
        color: active ? 'var(--agi-bg)' : 'var(--agi-ink-2)',
        transition: 'background 150ms ease, color 150ms ease',
      }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main client component
// ---------------------------------------------------------------------------

type TabId = 'yours' | 'inspiration';
type OverlayState =
  | { kind: 'none' }
  | { kind: 'category' }
  | { kind: 'wizard'; category: ArtifactCategory };

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
  const [activeTab, setActiveTab] = useState<TabId>('yours');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [mounted, setMounted] = useState(false);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | InspirationCard | null>(null);
  const [overlay, setOverlay] = useState<OverlayState>({ kind: 'none' });

  useEffect(() => {
    setMounted(true);
  }, []);

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
      // `genfile-<assetId>` rows are tool-generated FILES. The server already
      // stored them in `media_assets` and classified them
      // (`classifyGeneratedFile` -> surface: 'artifact' | 'file'), so Library
      // lists them under `<assetId>`. Listing them here too put one file in two
      // places under two ids that can never dedupe, deleting it in Library left
      // this card behind, pointing at bytes that no longer exist. They still
      // render inline in the conversation; only this second listing is gone.
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

  const [tabDefaulted, setTabDefaulted] = useState(false);

  // The default view has to be something to look at. Deciding this before the
  // index has settled would judge a signed-in visitor's history by a fetch
  // that has not landed yet, so it waits for auth and the index to both
  // report in, then decides once: a signed-out visitor, or one whose account
  // has nothing yet, sees the curated examples instead of an empty box. It
  // only runs once, so it never overrides a tab the visitor picked themself.
  useEffect(() => {
    if (tabDefaulted || !mounted || !authLoaded || !indexLoaded) return;
    if (!isSignedIn || sortedArtifacts.length === 0) {
      setActiveTab('inspiration');
    }
    setTabDefaulted(true);
  }, [tabDefaulted, mounted, authLoaded, indexLoaded, isSignedIn, sortedArtifacts.length]);

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

  const visibleInspiration = useMemo(
    () =>
      INSPIRATION.filter((card) => {
        if (typeFilter !== 'all' && card.type !== typeFilter) return false;
        return matchesSearch(normalizedQuery, [
          card.title,
          card.language,
          card.type,
          card.description,
        ]);
      }),
    [normalizedQuery, typeFilter],
  );

  // Offering a type the current tab has none of would silently empty the grid,
  // so the options come from the data the tab actually shows.
  const typeOptions = useMemo(() => {
    const source: ArtifactData['type'][] =
      activeTab === 'yours' ? sortedArtifacts.map((a) => a.type) : INSPIRATION.map((c) => c.type);
    return [...new Set(source)].sort();
  }, [activeTab, sortedArtifacts]);

  const filtersActive = normalizedQuery !== '' || typeFilter !== 'all' || dateFilter !== 'all';

  const clearFilters = () => {
    setQuery('');
    setTypeFilter('all');
    setDateFilter('all');
  };

  const selectTab = (tab: TabId) => {
    setActiveTab(tab);
    // The two tabs carry different type sets; keeping a type the new tab lacks
    // would show an empty grid under a filter the user cannot see the cause of.
    setTypeFilter('all');
  };

  const handleCategorySelect = (category: ArtifactCategory) => {
    if (category.id === 'scratch') {
      router.push('/chat');
      return;
    }
    setOverlay({ kind: 'wizard', category });
  };

  const handleLaunch = (prompt: string) => {
    const encoded = encodeURIComponent(prompt);
    router.push(`/chat?prompt=${encoded}`);
  };

  const cardGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 16,
  };

  return (
    <div data-design="agi" style={chrome === 'app' ? { minHeight: '100%' } : undefined}>
      {/* Pulse keyframes injected inline once */}
      <style>{`
        @keyframes agi-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
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
        <div className="agi-ds-container" style={{ paddingTop: 56 }}>
          {/* Title row with New Artifact button (Fix 33) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
              marginBottom: 8,
            }}
          >
            <div>
              <Eyebrow>Gallery</Eyebrow>
              <h1 className="agi-ds-h1">Artifacts</h1>
            </div>
            <button
              type="button"
              onClick={() => setOverlay({ kind: 'category' })}
              className="agi-ds-btn"
              data-variant="secondary"
            >
              <Plus size={14} />
              New Artifact
            </button>
          </div>

          <div style={{ marginBottom: 36 }}>
            <Prose>
              Browse artifacts you have built in conversations, or explore curated examples to spark
              your next idea.
            </Prose>
          </div>

          {/* Tabs */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: 4,
              background: 'var(--agi-bg-2)',
              border: '1px solid var(--agi-rule)',
              borderRadius: 10,
              marginBottom: 20,
            }}
          >
            <TabButton active={activeTab === 'yours'} onClick={() => selectTab('yours')}>
              Your artifacts
            </TabButton>
            <TabButton
              active={activeTab === 'inspiration'}
              onClick={() => selectTab('inspiration')}
            >
              Inspiration
            </TabButton>
          </div>

          {/* Search + filters */}
          <div className="agi-ds-form-row" style={{ alignItems: 'center', marginBottom: 32 }}>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search artifacts"
              aria-label="Search artifacts"
              className="agi-ds-input"
              style={{ flex: '1 1 240px', minWidth: 200, boxSizing: 'border-box' }}
            />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
              aria-label="Filter by type"
              className="agi-ds-input"
              style={{ width: 'auto' }}
            >
              <option value="all">All types</option>
              {typeOptions.map((type) => (
                <option key={type} value={type}>
                  {languageLabel(type)}
                </option>
              ))}
            </select>
            {activeTab === 'yours' && (
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as DateFilter)}
                aria-label="Filter by date"
                className="agi-ds-input"
                style={{ width: 'auto' }}
              >
                {DATE_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
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
        </div>

        {/* Tab content */}
        <div className="agi-ds-container" style={{ paddingBottom: 80 }}>
          {/* Your artifacts tab */}
          {activeTab === 'yours' && (
            <>
              {/* Loading skeleton (Fix 38) */}
              {!mounted ? (
                <div style={cardGridStyle}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <SkeletonCard key={i} />
                  ))}
                </div>
              ) : sortedArtifacts.length === 0 ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 12,
                    padding: '80px 24px',
                    border: '1px dashed var(--agi-rule)',
                    borderRadius: 16,
                    textAlign: 'center',
                  }}
                >
                  <Layers size={32} color="var(--agi-ink-faint)" />
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
                    style={{
                      marginTop: 8,
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
                    Create your first artifact
                  </button>
                </div>
              ) : visibleArtifacts.length === 0 ? (
                <NoMatchesState onClear={clearFilters} />
              ) : (
                <div style={cardGridStyle}>
                  {visibleArtifacts.map((artifact) => (
                    <ArtifactCard
                      key={artifact.id}
                      title={artifact.title}
                      // Index rows carry no language for non-code types; fall
                      // back to the artifact type so the badge still says
                      // something true rather than rendering empty.
                      language={artifact.language ?? artifact.type}
                      subtitle={`Created ${relativeTime(artifact.createdAt)}`}
                      type={artifact.type}
                      content={artifact.content}
                      onClick={() => {
                        // Derived locally on this device: open it in the preview
                        // panel directly, since we hold the content.
                        if (artifact.local) {
                          setSelectedArtifact(artifact.local);
                          return;
                        }
                        // Index-only: the content lives in the message that
                        // produced it, so send the user there. Rendering the
                        // conversation re-derives the artifact under this same
                        // id and the panel opens on it.
                        if (artifact.conversationId) {
                          router.push(`/chat/${artifact.conversationId}`);
                        }
                      }}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* Inspiration tab */}
          {activeTab === 'inspiration' &&
            (visibleInspiration.length === 0 ? (
              <NoMatchesState onClear={clearFilters} />
            ) : (
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
            ))}
        </div>
      </div>

      {/* Artifact detail drawer */}
      {selectedArtifact && (
        <ArtifactDrawer artifact={selectedArtifact} onClose={() => setSelectedArtifact(null)} />
      )}

      {/* Category picker (Fix 35) */}
      {overlay.kind === 'category' && (
        <CategoryPicker
          onClose={() => setOverlay({ kind: 'none' })}
          onSelect={handleCategorySelect}
        />
      )}

      {/* Creation wizard (Fix 36) */}
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
