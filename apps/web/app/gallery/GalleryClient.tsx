'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { X, Code, Layers, Plus } from 'lucide-react';
import { useArtifactsStore } from '@/features/chat/stores/artifacts-store';
import type { Artifact } from '@/features/chat/stores/artifacts-store';
import { ArtifactPreview } from '@/features/chat/components/artifacts/ArtifactPreview';
import type { ArtifactData } from '@/features/chat/components/artifacts/ArtifactPreview';

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
            sandbox="allow-scripts"
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
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--agi-ink)',
              lineHeight: 1.35,
            }}
          >
            {title}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--agi-amber)',
              background: 'var(--agi-amber-soft)',
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
            fontSize: 12,
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
          zIndex: 50,
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
          zIndex: 60,
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
              fontSize: 20,
              fontWeight: 700,
              color: 'var(--agi-ink)',
              letterSpacing: '-0.01em',
            }}
          >
            What do you want to create?
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--agi-ink-quiet)' }}>
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
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--agi-amber)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--agi-rule)';
              }}
            >
              <span style={{ fontSize: 22 }}>{cat.icon}</span>
              <span
                style={{ fontSize: 13, fontWeight: 600, color: 'var(--agi-ink)', lineHeight: 1.3 }}
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
        style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.55)' }}
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
          zIndex: 60,
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
                fontSize: 12,
                color: 'var(--agi-ink-quiet)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Step {currentStep + 1} of {WIZARD_STEPS.length} &mdash; {category.label}
            </p>
            <h2
              style={{
                margin: 0,
                fontSize: 19,
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
                background: i <= currentStep ? 'var(--agi-amber)' : 'var(--agi-rule)',
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
            fontSize: 14,
            fontFamily: 'inherit',
            resize: 'vertical',
            outline: 'none',
            boxSizing: 'border-box',
          }}
          onFocus={(e) => {
            (e.target as HTMLTextAreaElement).style.borderColor = 'var(--agi-amber)';
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
              fontSize: 13,
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
              background: 'var(--agi-amber)',
              border: 'none',
              borderRadius: 9,
              color: 'var(--agi-bg)',
              fontSize: 14,
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
          zIndex: 40,
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
          zIndex: 50,
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
              fontSize: 14,
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
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--agi-amber)',
              background: 'var(--agi-amber-soft)',
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
        fontSize: 13,
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

export function GalleryClient() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>('yours');
  const [mounted, setMounted] = useState(false);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | InspirationCard | null>(null);
  const [overlay, setOverlay] = useState<OverlayState>({ kind: 'none' });

  useEffect(() => {
    setMounted(true);
  }, []);

  const artifacts = useArtifactsStore((s) => s.artifacts);

  const sortedArtifacts = useMemo(
    () => [...artifacts].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    [artifacts],
  );

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
    <div data-design="agi">
      {/* Pulse keyframes injected inline once */}
      <style>{`
        @keyframes agi-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      <div
        style={{
          minHeight: '100vh',
          background: 'var(--agi-bg)',
          color: 'var(--agi-ink)',
        }}
      >
        {/* Page header */}
        <div
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            padding: '56px 32px 0',
          }}
        >
          {/* Title row with New Artifact button (Fix 33) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
              marginBottom: 8,
            }}
          >
            <h1
              style={{
                fontFamily: 'var(--serif, Georgia, serif)',
                fontSize: 'clamp(2rem, 4vw, 3rem)',
                fontWeight: 500,
                letterSpacing: '-0.02em',
                color: 'var(--agi-ink)',
                margin: 0,
              }}
            >
              Artifacts
            </h1>
            <button
              type="button"
              onClick={() => setOverlay({ kind: 'category' })}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '9px 18px',
                background: 'transparent',
                border: '1px solid var(--agi-amber)',
                borderRadius: 10,
                color: 'var(--agi-amber)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                marginTop: 8,
                transition: 'background 150ms',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'var(--agi-amber-soft)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
              }}
            >
              <Plus size={14} />
              New Artifact
            </button>
          </div>

          <p
            style={{
              fontSize: 15,
              color: 'var(--agi-ink-2)',
              margin: '0 0 36px',
              maxWidth: 560,
              lineHeight: 1.6,
            }}
          >
            Browse artifacts you have built in conversations, or explore curated examples to spark
            your next idea.
          </p>

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
              marginBottom: 32,
            }}
          >
            <TabButton active={activeTab === 'yours'} onClick={() => setActiveTab('yours')}>
              Your artifacts
            </TabButton>
            <TabButton
              active={activeTab === 'inspiration'}
              onClick={() => setActiveTab('inspiration')}
            >
              Inspiration
            </TabButton>
          </div>
        </div>

        {/* Tab content */}
        <div
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            padding: '0 32px 80px',
          }}
        >
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
                      fontSize: 15,
                      fontWeight: 500,
                      color: 'var(--agi-ink-2)',
                      margin: 0,
                    }}
                  >
                    Artifacts you create in conversations will appear here.
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--agi-ink-quiet)', margin: 0 }}>
                    Try asking AGI to build an HTML component, write a script, or create a diagram.
                  </p>
                  <button
                    type="button"
                    onClick={() => setOverlay({ kind: 'category' })}
                    style={{
                      marginTop: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--agi-amber)',
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
              ) : (
                <div style={cardGridStyle}>
                  {sortedArtifacts.map((artifact) => (
                    <ArtifactCard
                      key={artifact.id}
                      title={artifact.title}
                      language={artifact.language}
                      subtitle={`Created ${relativeTime(artifact.createdAt)}`}
                      type={artifact.type}
                      content={artifact.content}
                      onClick={() => setSelectedArtifact(artifact)}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* Inspiration tab */}
          {activeTab === 'inspiration' && (
            <div style={cardGridStyle}>
              {INSPIRATION.map((card) => (
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
          )}
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
