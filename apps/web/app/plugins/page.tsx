'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Puzzle, ArrowRight, Layers, Link2, Bell } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@shared/ui/card';
import { Button } from '@shared/ui/button';
import { Badge } from '@shared/ui/badge';
import { Input } from '@shared/ui/input';
import { cn } from '@shared/lib/utils';
import { EXAMPLE_PLUGINS } from '@/features/plugins/data/plugins';

function sourceBadgeClass(source: string): string {
  if (source === 'builtin') return 'bg-primary/15 text-primary border-primary/20';
  if (source === 'marketplace') return 'bg-blue-500/15 text-blue-400 border-blue-500/20';
  return 'bg-muted/60 text-muted-foreground border-border/40';
}

function sourceLabel(source: string): string {
  if (source === 'builtin') return 'Built-in';
  if (source === 'marketplace') return 'Marketplace';
  return 'Custom';
}

export default function PluginsPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleNotify(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    // Persist to localStorage as a stub (API not yet wired)
    try {
      const existing = JSON.parse(localStorage.getItem('agi-plugin-notify') ?? '[]') as string[];
      if (!existing.includes(email.trim())) {
        existing.push(email.trim());
        localStorage.setItem('agi-plugin-notify', JSON.stringify(existing));
      }
    } catch {
      // localStorage unavailable
    }
    setSubmitted(true);
    toast.success("You're on the list. We'll notify you when the Plugin Marketplace launches.");
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-10 text-center">
        <div className="mb-4 flex items-center justify-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
            <Puzzle className="h-5 w-5 text-primary" />
          </div>
        </div>
        <h1 className="font-heading mb-3 text-4xl font-bold tracking-tight text-foreground">
          Plugin Marketplace
        </h1>
        <p className="mx-auto max-w-xl text-base text-muted-foreground">
          Coming soon. Plugins will bundle skills and connectors into workflow packs. This preview
          shows the planned catalogue shape before installation is available.
        </p>
      </div>

      {/* What plugins will offer */}
      <div className="mb-10 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border/60 bg-card p-5">
          <Layers className="mb-3 h-5 w-5 text-primary" />
          <h2 className="mb-1 text-sm font-semibold text-foreground">Bundled Skills</h2>
          <p className="text-xs text-muted-foreground">
            Each plugin ships with curated skill prompts tuned for a specific workflow.
          </p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-5">
          <Link2 className="mb-3 h-5 w-5 text-primary" />
          <h2 className="mb-1 text-sm font-semibold text-foreground">Connector Wiring</h2>
          <p className="text-xs text-muted-foreground">
            Plugins declare which connectors they need. Connect once and the plugin just works.
          </p>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-5">
          <ArrowRight className="mb-3 h-5 w-5 text-primary" />
          <h2 className="mb-1 text-sm font-semibold text-foreground">Launch Preview</h2>
          <p className="text-xs text-muted-foreground">
            Browse upcoming packs while marketplace installation and enforcement are finalized.
          </p>
        </div>
      </div>

      {/* Preview grid */}
      <div className="mb-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Preview
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {EXAMPLE_PLUGINS.map((plugin) => (
            <Link key={plugin.id} href={`/plugins/${plugin.id}`} className="group block">
              <Card className="h-full transition-all duration-150 hover:border-primary/30 hover:shadow-md">
                <CardHeader className="pb-3">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <CardTitle
                      as="h3"
                      className="text-base font-semibold leading-snug text-foreground group-hover:text-primary"
                    >
                      {plugin.name}
                    </CardTitle>
                    <Badge
                      className={cn(
                        'shrink-0 border text-[10px] font-medium',
                        sourceBadgeClass(plugin.source),
                      )}
                    >
                      {sourceLabel(plugin.source)}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">{plugin.description}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{plugin.category}</span>
                    <span>by {plugin.author}</span>
                  </div>
                  {plugin.skills.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {plugin.skills.slice(0, 3).map((skill) => (
                        <span
                          key={skill}
                          className="rounded-full border border-border/50 bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Notify me form */}
      <div className="rounded-2xl border border-border/60 bg-card px-6 py-8 text-center">
        <Bell className="mx-auto mb-3 h-6 w-6 text-primary" />
        <h2 className="mb-1 text-lg font-semibold text-foreground">Get notified at launch</h2>
        <p className="mb-5 text-sm text-muted-foreground">
          Be the first to know when the Plugin Marketplace opens.
        </p>
        {submitted ? (
          <p className="text-sm font-medium text-primary">
            You are on the list. We will let you know when plugins launch.
          </p>
        ) : (
          <form
            onSubmit={handleNotify}
            className="mx-auto flex max-w-sm flex-col gap-2 sm:flex-row"
          >
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              aria-label="Email address for plugin launch notification"
              className="flex-1"
            />
            <Button type="submit" className="shrink-0">
              Notify me
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
