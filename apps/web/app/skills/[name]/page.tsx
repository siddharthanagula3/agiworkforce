'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import type React from 'react';
import { ArrowLeft, FileText, Code, Tag, Database, Terminal, Hash, User } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { MarkdownContent } from '@agiworkforce/unified-chat';

interface SkillMeta {
  name: string;
  description: string;
  source: string;
}

function skillSourceLabel(source: string): string {
  if (source === 'bundled' || source === 'managed-local') return 'Built-in';
  if (source === 'personal') return 'Personal';
  if (source === 'plugin' || source === 'mcp') return 'Plugin';
  if (source === 'project' || source === 'workspace') return 'Project';
  return source;
}

type DetailTab = 'preview' | 'code';

function DetailSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-7 w-48 rounded bg-white/[0.06]" />
      <div className="h-4 w-96 rounded bg-white/[0.04]" />
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-lg border border-white/[0.06] bg-white/[0.02]" />
        ))}
      </div>
      <div className="h-64 rounded-lg border border-white/[0.06] bg-white/[0.02]" />
    </div>
  );
}

function CodeView({ content }: { content: string }) {
  return (
    <div className="code-block-container group relative">
      <div className="code-block-header-bar">
        <span className="code-block-lang-label">markdown</span>
      </div>
      <div className="code-block-body overflow-auto max-h-[600px]">
        <pre className="text-sm leading-relaxed">
          <code className="language-markdown">{content}</code>
        </pre>
      </div>
    </div>
  );
}

function MetaRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
        <Icon className="h-3 w-3" aria-hidden="true" />
        {label}
      </div>
      <p className="truncate font-mono text-xs text-foreground/80">{value || '-'}</p>
    </div>
  );
}

export default function SkillDetailPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const decodedName = decodeURIComponent(name);

  const [meta, setMeta] = useState<SkillMeta | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [bodyLoading, setBodyLoading] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('preview');

  useEffect(() => {
    let cancelled = false;
    setMetaLoading(true);
    setMetaError(null);
    fetch('/api/skills')
      .then(async (res) => {
        if (!res.ok) throw new Error(`/api/skills returned ${res.status}`);
        const json = (await res.json()) as { skills: SkillMeta[] };
        return json.skills ?? [];
      })
      .then((items) => {
        if (cancelled) return;
        const found = items.find((s) => s.name === decodedName) ?? null;
        if (!found) {
          setMetaError(`Skill "${decodedName}" not found.`);
        } else {
          setMeta(found);
        }
        setMetaLoading(false);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setMetaError(err instanceof Error ? err.message : 'Failed to load skill metadata');
          setMetaLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [decodedName]);

  useEffect(() => {
    let cancelled = false;
    setBodyLoading(true);
    setBodyError(null);
    fetch(`/api/skills/${encodeURIComponent(decodedName)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`/api/skills/${decodedName} returned ${res.status}`);
        const json = (await res.json()) as { body: string };
        return json.body ?? '';
      })
      .then((b) => {
        if (!cancelled) {
          setBody(b);
          setBodyLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setBodyError(err instanceof Error ? err.message : 'Failed to load skill body');
          setBodyLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [decodedName]);

  return (
    <div className="min-h-full bg-background">
      {/* Page Header */}
      <div className="border-b border-white/[0.06] bg-black/20 px-6 py-5">
        <div className="mx-auto max-w-4xl">
          <Link
            href="/skills"
            className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to Skills
          </Link>

          {metaLoading ? (
            <div className="space-y-2">
              <div className="h-7 w-48 animate-pulse rounded bg-white/[0.06]" />
              <div className="h-4 w-80 animate-pulse rounded bg-white/[0.04]" />
            </div>
          ) : metaError ? (
            <div>
              <h1 className="text-2xl font-bold text-foreground">{decodedName}</h1>
              <p className="mt-1 text-sm text-destructive">{metaError}</p>
            </div>
          ) : meta ? (
            <div>
              <h1 className="text-2xl font-bold text-foreground">{meta.name}</h1>
              {meta.description && (
                <p className="mt-1 text-sm text-muted-foreground">{meta.description}</p>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-4xl px-6 py-6">
        {metaLoading ? (
          <DetailSkeleton />
        ) : metaError ? (
          <div className="py-20 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.04]">
              <FileText className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="text-base font-medium text-foreground">Skill not found</h3>
            <p className="mt-1 text-sm text-muted-foreground">{metaError}</p>
            <Link
              href="/skills"
              className="mt-4 inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Skills
            </Link>
          </div>
        ) : meta ? (
          <div className="space-y-6">
            {/* Metadata section */}
            <section aria-label="Skill metadata">
              <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
                Metadata
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <MetaRow icon={Hash} label="Trigger" value={`/${meta.name}`} />
                <MetaRow icon={User} label="Added by" value={skillSourceLabel(meta.source)} />
                <MetaRow icon={Database} label="Source" value={meta.source} />
                <MetaRow icon={Terminal} label="Allowed tools" value="Not specified" />
                <MetaRow icon={Tag} label="Name" value={meta.name} />
              </div>
            </section>

            {/* Body section with tabs */}
            <section aria-label="Skill body">
              {/* Tab bar */}
              <div className="mb-3 flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.03] p-0.5 w-fit">
                {(['preview', 'code'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-all duration-150',
                      activeTab === tab
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                    aria-pressed={activeTab === tab}
                  >
                    {tab === 'preview' ? (
                      <FileText className="h-3 w-3" aria-hidden="true" />
                    ) : (
                      <Code className="h-3 w-3" aria-hidden="true" />
                    )}
                    {tab === 'preview' ? 'Preview' : 'Code'}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              {bodyLoading ? (
                <div className="space-y-2 animate-pulse">
                  <div className="h-4 w-full rounded bg-white/[0.04]" />
                  <div className="h-4 w-4/5 rounded bg-white/[0.04]" />
                  <div className="h-4 w-3/4 rounded bg-white/[0.04]" />
                  <div className="h-4 w-full rounded bg-white/[0.04]" />
                  <div className="h-4 w-2/3 rounded bg-white/[0.04]" />
                </div>
              ) : bodyError ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
                  <p className="text-sm text-destructive">{bodyError}</p>
                </div>
              ) : body !== null ? (
                activeTab === 'preview' ? (
                  <div className="prose prose-invert prose-sm max-w-none rounded-lg border border-white/[0.06] bg-white/[0.02] px-5 py-4">
                    {body.trim() ? (
                      <MarkdownContent content={body} />
                    ) : (
                      <p className="text-sm text-muted-foreground italic">No content.</p>
                    )}
                  </div>
                ) : (
                  <CodeView content={body} />
                )
              ) : null}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
