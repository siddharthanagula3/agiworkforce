'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { cn } from '../cn';
import { toUserMessage } from '../lib/network-error';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../primitives/Dialog';
import { Spinner } from '../primitives/Spinner';
import {
  CREATE_PLUGIN_ADD_SKILL_LABEL,
  CREATE_PLUGIN_DESCRIPTION_LABEL,
  CREATE_PLUGIN_DESCRIPTION_PLACEHOLDER,
  CREATE_PLUGIN_FAILED_COPY,
  CREATE_PLUGIN_INTRO,
  CREATE_PLUGIN_LABEL,
  CREATE_PLUGIN_NAME_LABEL,
  CREATE_PLUGIN_NAME_PLACEHOLDER,
  CREATE_PLUGIN_REMOVE_SKILL_LABEL,
  CREATE_PLUGIN_SKILL_BODY_LABEL,
  CREATE_PLUGIN_SKILL_BODY_PLACEHOLDER,
  CREATE_PLUGIN_SKILL_DESCRIPTION_LABEL,
  CREATE_PLUGIN_SKILL_DESCRIPTION_PLACEHOLDER,
  CREATE_PLUGIN_SKILL_HEADING,
  CREATE_PLUGIN_SKILL_NAME_HINT,
  CREATE_PLUGIN_SKILL_NAME_LABEL,
  CREATE_PLUGIN_SKILL_NAME_PLACEHOLDER,
  CREATE_PLUGIN_SUBMIT_LABEL,
  UPLOAD_BUSY_LABEL,
  UPLOAD_CANCEL_LABEL,
  UPLOAD_DONE_LABEL,
} from './constants';
import { DIRECTORY_CREATE_BUTTON, DIRECTORY_FOCUS_RING } from './styles';
import type { DirectoryPluginDraftSkill, DirectoryUploadResult } from './types';

const FIELD_CLASS =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground';
const LABEL_CLASS = 'text-xs font-medium text-foreground';

function emptySkill(): DirectoryPluginDraftSkill {
  return { name: '', description: '', body: '' };
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex flex-col gap-1">
        <span className={LABEL_CLASS}>{label}</span>
        {children}
      </label>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

export function CreatePluginDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (draft: {
    name: string;
    description: string;
    skills: readonly DirectoryPluginDraftSkill[];
  }) => Promise<DirectoryUploadResult>;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [skills, setSkills] = useState<DirectoryPluginDraftSkill[]>([emptySkill()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DirectoryUploadResult | null>(null);

  const close = () => {
    setName('');
    setDescription('');
    setSkills([emptySkill()]);
    setBusy(false);
    setError(null);
    setResult(null);
    onClose();
  };

  const updateSkill = (index: number, patch: Partial<DirectoryPluginDraftSkill>) => {
    setSkills((current) =>
      current.map((skill, position) => (position === index ? { ...skill, ...patch } : skill)),
    );
  };

  const complete =
    name.trim().length > 0 &&
    description.trim().length > 0 &&
    skills.every(
      (skill) =>
        skill.name.trim().length > 0 &&
        skill.description.trim().length > 0 &&
        skill.body.trim().length > 0,
    );

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(
        await onSubmit({
          name: name.trim(),
          description: description.trim(),
          skills: skills.map((skill) => ({
            name: skill.name.trim(),
            description: skill.description.trim(),
            body: skill.body.trim(),
          })),
        }),
      );
    } catch (caught) {
      setError(toUserMessage(caught, CREATE_PLUGIN_FAILED_COPY));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) close();
      }}
    >
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{result ? result.title : CREATE_PLUGIN_LABEL}</DialogTitle>
          <DialogDescription>{result ? '' : CREATE_PLUGIN_INTRO}</DialogDescription>
        </DialogHeader>

        {result ? (
          <ul className="flex flex-col gap-1 text-sm text-foreground">
            {result.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col gap-4">
            <Field label={CREATE_PLUGIN_NAME_LABEL}>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={CREATE_PLUGIN_NAME_PLACEHOLDER}
                className={cn(FIELD_CLASS, DIRECTORY_FOCUS_RING)}
              />
            </Field>
            <Field label={CREATE_PLUGIN_DESCRIPTION_LABEL}>
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={CREATE_PLUGIN_DESCRIPTION_PLACEHOLDER}
                className={cn(FIELD_CLASS, DIRECTORY_FOCUS_RING)}
              />
            </Field>

            <div className="flex flex-col gap-3">
              <h3 className={LABEL_CLASS}>{CREATE_PLUGIN_SKILL_HEADING}</h3>
              {skills.map((skill, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3"
                >
                  <Field
                    label={CREATE_PLUGIN_SKILL_NAME_LABEL}
                    hint={CREATE_PLUGIN_SKILL_NAME_HINT}
                  >
                    <input
                      value={skill.name}
                      onChange={(event) => updateSkill(index, { name: event.target.value })}
                      placeholder={CREATE_PLUGIN_SKILL_NAME_PLACEHOLDER}
                      className={cn(FIELD_CLASS, DIRECTORY_FOCUS_RING)}
                    />
                  </Field>
                  <Field label={CREATE_PLUGIN_SKILL_DESCRIPTION_LABEL}>
                    <input
                      value={skill.description}
                      onChange={(event) => updateSkill(index, { description: event.target.value })}
                      placeholder={CREATE_PLUGIN_SKILL_DESCRIPTION_PLACEHOLDER}
                      className={cn(FIELD_CLASS, DIRECTORY_FOCUS_RING)}
                    />
                  </Field>
                  <Field label={CREATE_PLUGIN_SKILL_BODY_LABEL}>
                    <textarea
                      value={skill.body}
                      rows={4}
                      onChange={(event) => updateSkill(index, { body: event.target.value })}
                      placeholder={CREATE_PLUGIN_SKILL_BODY_PLACEHOLDER}
                      className={cn(FIELD_CLASS, 'resize-y', DIRECTORY_FOCUS_RING)}
                    />
                  </Field>
                  {skills.length > 1 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setSkills((current) => current.filter((_, position) => position !== index))
                      }
                      className={cn(
                        'inline-flex min-h-8 w-fit items-center gap-2 rounded-lg border border-border px-3 text-xs text-foreground hover:bg-muted',
                        DIRECTORY_FOCUS_RING,
                      )}
                    >
                      <Trash2 aria-hidden className="size-3.5" />
                      {CREATE_PLUGIN_REMOVE_SKILL_LABEL}
                    </button>
                  ) : null}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setSkills((current) => [...current, emptySkill()])}
                className={cn(DIRECTORY_CREATE_BUTTON, 'w-fit gap-2')}
              >
                <Plus aria-hidden className="size-3.5" />
                {CREATE_PLUGIN_ADD_SKILL_LABEL}
              </button>
            </div>

            {error ? (
              <p
                role="alert"
                className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-danger"
              >
                {error}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {result ? (
            <button type="button" onClick={close} className={DIRECTORY_CREATE_BUTTON}>
              {UPLOAD_DONE_LABEL}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={close}
                disabled={busy}
                className={cn(
                  'inline-flex min-h-9 items-center rounded-lg border border-border px-3 text-sm text-foreground disabled:opacity-60',
                  DIRECTORY_FOCUS_RING,
                )}
              >
                {UPLOAD_CANCEL_LABEL}
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy || !complete}
                className={cn(DIRECTORY_CREATE_BUTTON, 'gap-2 disabled:opacity-60')}
              >
                {busy ? <Spinner aria-label={UPLOAD_BUSY_LABEL} className="size-4" /> : null}
                {busy ? UPLOAD_BUSY_LABEL : CREATE_PLUGIN_SUBMIT_LABEL}
              </button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
