'use client';

import { memo, useState } from 'react';
import { Blocks, Check } from 'lucide-react';
import type { PluginDraft } from '@agiworkforce/cloud-contracts';
import { Spinner } from '@agiworkforce/ui';

import { getCsrfToken } from '@/lib/client/csrf';
import { cn } from '@shared/lib/utils';
import { buildSettingsBrowseHash } from '@/features/directory/routing';
import {
  CSRF_HEADER,
  JSON_CONTENT_TYPE,
  PLUGIN_AUTHORED_PATH,
  SKILLS_PATH,
} from '@/features/directory/constants';

const DRAFT_LABEL = 'Plugin draft';
const SAVE_PLUGIN_LABEL = 'Save plugin';
const SAVE_SKILL_LABEL = 'Save as a skill';
const SAVING_LABEL = 'Saving';
const OPEN_LABEL = 'Open';
const SAVE_FAILED_COPY = 'This draft could not be saved. Try again.';
const SAVED_PLUGIN_COPY = 'Saved as a plugin. Its skills are on in your chats.';
const SAVED_SKILL_COPY = 'Saved as a skill. It is on in your chats.';
const NOT_SAVED_COPY = 'Not saved yet. Nothing changes until you save it.';

type SaveTarget = 'plugin' | 'skill';

interface SavedDraft {
  target: SaveTarget;
  href: string;
}

async function saveDraft(draft: PluginDraft, target: SaveTarget): Promise<SavedDraft> {
  const csrfToken = await getCsrfToken();
  const skill = draft.skills[0];
  const response = await fetch(target === 'plugin' ? PLUGIN_AUTHORED_PATH : SKILLS_PATH, {
    method: 'POST',
    headers: { 'Content-Type': JSON_CONTENT_TYPE, [CSRF_HEADER]: csrfToken },
    body: JSON.stringify(target === 'plugin' ? draft : skill),
  });
  const body = (await response.json().catch(() => ({}))) as {
    plugins?: ReadonlyArray<{ entryId: string }>;
    skill?: { name: string };
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(body.error?.message ?? SAVE_FAILED_COPY);
  const entryId = body.plugins?.[0]?.entryId;
  return {
    target,
    href:
      target === 'plugin'
        ? buildSettingsBrowseHash('plugins', entryId ?? null)
        : buildSettingsBrowseHash('skills', body.skill?.name ?? skill?.name ?? null),
  };
}

const BUTTON_CLASS =
  'inline-flex h-7 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60 pointer-coarse:h-11';

function PluginDraftCardImpl({ draft, className }: { draft: PluginDraft; className?: string }) {
  const [saving, setSaving] = useState<SaveTarget | null>(null);
  const [saved, setSaved] = useState<SavedDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async (target: SaveTarget) => {
    setSaving(target);
    setError(null);
    try {
      setSaved(await saveDraft(draft, target));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : SAVE_FAILED_COPY);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div
      role="group"
      aria-label={`${DRAFT_LABEL}: ${draft.name}`}
      data-testid="plugin-draft-card"
      className={cn('rounded-lg border border-border bg-muted/30 p-3 text-sm', className)}
    >
      <div className="flex items-start gap-2.5">
        <Blocks className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="space-y-1">
            <p className="text-caption font-medium text-muted-foreground">{DRAFT_LABEL}</p>
            <p className="font-medium text-foreground">{draft.name}</p>
            <p className="text-xs text-muted-foreground">{draft.description}</p>
          </div>
          <ul className="space-y-1.5">
            {draft.skills.map((skill) => (
              <li key={skill.name} className="min-w-0">
                <span className="font-mono text-xs text-foreground">/{skill.name}</span>
                <span className="block text-xs text-muted-foreground">{skill.description}</span>
              </li>
            ))}
          </ul>
          {saved ? (
            <p role="status" className="flex flex-wrap items-center gap-2 text-xs text-foreground">
              <Check className="h-3.5 w-3.5 text-success-text" aria-hidden="true" />
              {saved.target === 'plugin' ? SAVED_PLUGIN_COPY : SAVED_SKILL_COPY}
              <a
                href={saved.href}
                className="font-medium text-foreground underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {OPEN_LABEL}
              </a>
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => void save('plugin')}
                  disabled={saving !== null}
                  className={cn(
                    BUTTON_CLASS,
                    'bg-primary text-primary-foreground hover:bg-primary/90',
                  )}
                >
                  {saving === 'plugin' ? <Spinner size="sm" aria-label={SAVING_LABEL} /> : null}
                  {SAVE_PLUGIN_LABEL}
                </button>
                {draft.skills.length === 1 ? (
                  <button
                    type="button"
                    onClick={() => void save('skill')}
                    disabled={saving !== null}
                    className={cn(
                      BUTTON_CLASS,
                      'border border-border text-foreground hover:bg-muted',
                    )}
                  >
                    {saving === 'skill' ? <Spinner size="sm" aria-label={SAVING_LABEL} /> : null}
                    {SAVE_SKILL_LABEL}
                  </button>
                ) : null}
              </div>
              <p className="text-caption text-muted-foreground">{NOT_SAVED_COPY}</p>
            </>
          )}
          {error ? (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export const PluginDraftCard = memo(PluginDraftCardImpl);
