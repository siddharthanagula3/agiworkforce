'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, Code, Layers } from 'lucide-react';
import { useArtifactsStore } from '@/features/chat/stores/artifacts-store';
import type { Artifact } from '@/features/chat/stores/artifacts-store';
import { ArtifactPreview } from '@/features/chat/components/artifacts/ArtifactPreview';

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
  body { margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #0a0a0a; }
  .btn {
    padding: 14px 32px;
    font-size: 15px;
    font-weight: 600;
    border: none;
    border-radius: 10px;
    background: linear-gradient(135deg, #c8892a, #e8b84b, #c8892a);
    background-size: 200% 200%;
    color: #09090b;
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
  <rect width="200" height="60" rx="8" fill="#0d0d0a"/>
  <text x="20" y="38" font-family="Georgia, serif" font-size="26" font-weight="700" fill="#c8892a">AGI</text>
  <text x="72" y="38" font-family="Georgia, serif" font-size="26" font-weight="400" fill="#f5f4ee"> Workforce</text>
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
    """Yield records from source — replace with real I/O."""
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
  body { margin: 0; padding: 24px; background: #09090b; font-family: system-ui, sans-serif; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 16px; }
  .card {
    background: #111110;
    border: 1px solid rgba(245,244,238,0.12);
    border-radius: 12px;
    padding: 20px 16px;
    color: #f5f4ee;
    font-size: 13px;
  }
  .card h3 { margin: 0 0 6px; font-size: 15px; color: #c8892a; }
  .card p  { margin: 0; color: #b8b5ac; line-height: 1.5; }
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
// Card
// ---------------------------------------------------------------------------

interface ArtifactCardProps {
  title: string;
  language: string;
  subtitle: string;
  onClick: () => void;
}

function ArtifactCard({ title, language, subtitle, onClick }: ArtifactCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'var(--agi-card)',
        border: '1px solid var(--agi-rule)',
        borderRadius: 14,
        padding: '20px 20px 18px',
        textAlign: 'left',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        transition: 'border-color 200ms ease',
        width: '100%',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--agi-rule-strong)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--agi-rule)';
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
    </button>
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
  // Escape key to close
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

export function GalleryClient() {
  const [activeTab, setActiveTab] = useState<TabId>('yours');
  const [mounted, setMounted] = useState(false);
  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | InspirationCard | null>(null);

  // Avoid SSR/CSR mismatch by waiting for mount before reading the store
  useEffect(() => {
    setMounted(true);
  }, []);

  const artifacts = useArtifactsStore((s) => s.artifacts);

  // Sort newest first
  const sortedArtifacts = useMemo(
    () => [...artifacts].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    [artifacts],
  );

  const cardGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 16,
  };

  return (
    <div data-design="agi">
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
          <h1
            style={{
              fontFamily: 'var(--serif, Georgia, serif)',
              fontSize: 'clamp(2rem, 4vw, 3rem)',
              fontWeight: 500,
              letterSpacing: '-0.02em',
              color: 'var(--agi-ink)',
              margin: '0 0 8px',
            }}
          >
            Gallery.
          </h1>
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
              {!mounted || sortedArtifacts.length === 0 ? (
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
                  <a
                    href="/chat"
                    style={{
                      marginTop: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--agi-amber)',
                      textDecoration: 'none',
                    }}
                  >
                    Start a conversation
                  </a>
                </div>
              ) : (
                <div style={cardGridStyle}>
                  {sortedArtifacts.map((artifact) => (
                    <ArtifactCard
                      key={artifact.id}
                      title={artifact.title}
                      language={artifact.language}
                      subtitle={`Created ${relativeTime(artifact.createdAt)}`}
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
    </div>
  );
}
