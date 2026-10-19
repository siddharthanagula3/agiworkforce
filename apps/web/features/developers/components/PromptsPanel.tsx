'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Spinner,
  Textarea,
  cn,
  useConfirmAction,
} from '@agiworkforce/ui';
import {
  DEVELOPER_PROMPT_NAME_MAX_CHARS,
  DEVELOPER_PROMPT_NOTE_MAX_CHARS,
  DEVELOPER_PROMPT_TEXT_MAX_CHARS,
  promptTemplateVariables,
  type DeveloperPrompt,
  type DeveloperPromptVersion,
  type DeveloperPromptVersionInput,
} from '@agiworkforce/cloud-contracts';

import { toUserMessage } from '@/lib/user-error-message';
import { formatRetirement, useGatewayModels } from '../hooks/use-gateway-models';
import { promptsApi, type PromptsApi } from '../lib/prompts-client';
import { diffLines } from '../lib/text-diff';
import { PromptEvaluations } from './PromptEvaluations';

const AUTO_MODEL = 'auto';
const SELECT_CLASS =
  'h-9 w-full rounded-md border border-border bg-background px-3 font-mono text-sm text-foreground pointer-coarse:min-h-11';

interface VersionDraft {
  systemPrompt: string;
  template: string;
  model: string;
  maxTokens: string;
  temperature: string;
  note: string;
}

const EMPTY_DRAFT: VersionDraft = {
  systemPrompt: '',
  template: '',
  model: AUTO_MODEL,
  maxTokens: '',
  temperature: '',
  note: '',
};

function draftOf(version: DeveloperPromptVersion | null): VersionDraft {
  if (!version) return EMPTY_DRAFT;
  return {
    systemPrompt: version.systemPrompt,
    template: version.template,
    model: version.model,
    maxTokens: version.maxTokens === null ? '' : String(version.maxTokens),
    temperature: version.temperature === null ? '' : String(version.temperature),
    note: '',
  };
}

export function versionInputOf(draft: VersionDraft): DeveloperPromptVersionInput {
  const maxTokens = Number.parseInt(draft.maxTokens, 10);
  const temperature = Number.parseFloat(draft.temperature);
  return {
    systemPrompt: draft.systemPrompt,
    template: draft.template,
    model: draft.model,
    maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : null,
    temperature:
      draft.temperature.trim() !== '' && Number.isFinite(temperature) ? temperature : null,
    note: draft.note.trim() || null,
  };
}

function sameAsVersion(draft: VersionDraft, version: DeveloperPromptVersion | null): boolean {
  if (!version) return false;
  const input = versionInputOf(draft);
  return (
    input.systemPrompt === version.systemPrompt &&
    input.template === version.template &&
    input.model === version.model &&
    input.maxTokens === version.maxTokens &&
    input.temperature === version.temperature
  );
}

function VersionDiff({
  before,
  after,
}: {
  before: DeveloperPromptVersion;
  after: DeveloperPromptVersion;
}) {
  const sections: Array<[string, string, string]> = [
    ['System prompt', before.systemPrompt, after.systemPrompt],
    ['Template', before.template, after.template],
    [
      'Model and parameters',
      `${before.model} · max_tokens ${before.maxTokens ?? 'default'} · temperature ${before.temperature ?? 'default'}`,
      `${after.model} · max_tokens ${after.maxTokens ?? 'default'} · temperature ${after.temperature ?? 'default'}`,
    ],
  ];
  return (
    <div
      className="flex flex-col gap-3"
      aria-label={`Changes from version ${before.version} to ${after.version}`}
    >
      {sections.map(([label, left, right]) => (
        <div key={label} className="rounded-lg border border-border">
          <p className="border-b border-border px-3 py-1.5 text-xs font-medium text-muted-foreground">
            {label}
          </p>
          <pre className="max-h-60 overflow-auto p-2 font-mono text-xs leading-5">
            {left === right ? (
              <span className="text-muted-foreground">No change</span>
            ) : (
              diffLines(left, right).map((line, index) => (
                <span
                  key={index}
                  className={cn(
                    'block whitespace-pre-wrap',
                    line.kind === 'added' && 'text-success-text',
                    line.kind === 'removed' && 'text-danger-text',
                    line.kind === 'same' && 'text-foreground',
                  )}
                >
                  {line.kind === 'added' ? '+ ' : line.kind === 'removed' ? '- ' : '  '}
                  {line.text}
                </span>
              ))
            )}
          </pre>
        </div>
      ))}
    </div>
  );
}

function PromptWorkspace({
  api,
  prompt,
  onPromptChange,
  onDeleted,
}: {
  api: PromptsApi;
  prompt: DeveloperPrompt;
  onPromptChange: (prompt: DeveloperPrompt) => void;
  onDeleted: () => void;
}) {
  const id = useId();
  const { list } = useGatewayModels();
  const { confirm, dialog } = useConfirmAction();
  const [draft, setDraft] = useState<VersionDraft>(() => draftOf(prompt.latest));
  const [versions, setVersions] = useState<DeveloperPromptVersion[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compareWith, setCompareWith] = useState<number | null>(null);

  const loadVersions = useCallback(() => {
    api
      .versions(prompt.id)
      .then(setVersions)
      .catch((reason: unknown) => setError(toUserMessage(reason, 'Versions could not be loaded.')));
  }, [api, prompt.id]);

  useEffect(loadVersions, [loadVersions]);

  const update = (field: keyof VersionDraft) => (value: string) =>
    setDraft((previous) => ({ ...previous, [field]: value }));

  const unchanged = sameAsVersion(draft, prompt.latest);
  const variables = useMemo(() => promptTemplateVariables(draft.template), [draft.template]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const next = await api.saveVersion(prompt.id, versionInputOf(draft));
      onPromptChange(next);
      setDraft(draftOf(next.latest));
      loadVersions();
    } catch (reason) {
      setError(toUserMessage(reason, 'The version could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = () =>
    confirm({
      title: `Delete ${prompt.name}?`,
      description:
        'Its versions, test cases and every evaluation run and grade are deleted and cannot be recovered. API requests you already made are not affected.',
      confirmLabel: 'Delete prompt',
      destructive: true,
      onConfirm: async () => {
        try {
          await api.remove(prompt.id);
          onDeleted();
        } catch (reason) {
          setError(toUserMessage(reason, 'The prompt could not be deleted.'));
        }
      },
    });

  const latest = versions[0] ?? null;
  const compared = versions.find((version) => version.version === compareWith) ?? null;

  return (
    <div className="flex flex-col gap-4">
      {dialog}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-system`}>System prompt</Label>
        <Textarea
          id={`${id}-system`}
          value={draft.systemPrompt}
          maxLength={DEVELOPER_PROMPT_TEXT_MAX_CHARS}
          rows={3}
          onChange={(event) => update('systemPrompt')(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-template`}>User message template</Label>
        <Textarea
          id={`${id}-template`}
          value={draft.template}
          maxLength={DEVELOPER_PROMPT_TEXT_MAX_CHARS}
          rows={5}
          className="font-mono text-xs"
          aria-describedby={`${id}-template-help`}
          onChange={(event) => update('template')(event.target.value)}
        />
        <p id={`${id}-template-help`} className="text-xs text-muted-foreground">
          {variables.length > 0
            ? `Variables: ${variables.join(', ')}. Each test case fills them in.`
            : 'Write {{variable}} where a test case should fill in a value.'}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-model`}>Model</Label>
          <select
            id={`${id}-model`}
            value={draft.model}
            disabled={list.status === 'loading'}
            onChange={(event) => update('model')(event.target.value)}
            className={SELECT_CLASS}
          >
            <option value={AUTO_MODEL}>{AUTO_MODEL}</option>
            {list.status === 'ready'
              ? list.models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.deprecationDate
                      ? `${model.id} (leaving ${formatRetirement(model.deprecationDate)})`
                      : model.id}
                  </option>
                ))
              : null}
            {list.status === 'ready' &&
            draft.model !== AUTO_MODEL &&
            !list.models.some((model) => model.id === draft.model) ? (
              <option value={draft.model}>{draft.model}</option>
            ) : null}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-max-tokens`}>max_tokens</Label>
          <Input
            id={`${id}-max-tokens`}
            type="number"
            inputMode="numeric"
            min={1}
            value={draft.maxTokens}
            placeholder="Model default"
            onChange={(event) => update('maxTokens')(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-temperature`}>temperature</Label>
          <Input
            id={`${id}-temperature`}
            type="number"
            inputMode="decimal"
            min={0}
            max={2}
            step={0.1}
            value={draft.temperature}
            placeholder="Model default"
            onChange={(event) => update('temperature')(event.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor={`${id}-note`}>What changed (optional)</Label>
          <Input
            id={`${id}-note`}
            value={draft.note}
            maxLength={DEVELOPER_PROMPT_NOTE_MAX_CHARS}
            onChange={(event) => update('note')(event.target.value)}
          />
        </div>
        <Button
          className="pointer-coarse:min-h-11"
          disabled={saving || unchanged || draft.template.trim() === ''}
          aria-busy={saving}
          onClick={() => void save()}
        >
          {saving ? <Spinner size="sm" className="me-2" aria-hidden="true" /> : null}
          Save as version {(prompt.latest?.version ?? 0) + 1}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <section aria-label="Versions" className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-foreground">Versions</h3>
        <ol className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {versions.map((version) => (
            <li
              key={version.version}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm text-foreground">
                  Version {version.version}
                  <span className="font-mono text-xs text-muted-foreground">
                    {' '}
                    · {version.model}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(version.createdAt).toLocaleString()}
                  {version.note ? ` · ${version.note}` : ''}
                </p>
              </div>
              <div className="flex gap-1">
                {latest && version.version !== latest.version ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-pressed={compareWith === version.version}
                    onClick={() =>
                      setCompareWith(compareWith === version.version ? null : version.version)
                    }
                  >
                    Compare with latest
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Load version ${version.version} into the editor`}
                  onClick={() =>
                    setDraft({
                      ...draftOf(version),
                      note: `Rolled back to version ${version.version}`,
                    })
                  }
                >
                  Load
                </Button>
              </div>
            </li>
          ))}
        </ol>
        {compared && latest ? <VersionDiff before={compared} after={latest} /> : null}
      </section>

      <PromptEvaluations
        api={api}
        prompt={prompt}
        versions={versions}
        variables={promptTemplateVariables(prompt.latest?.template ?? '')}
        onCasesChange={(caseCount) => onPromptChange({ ...prompt, caseCount })}
      />

      <div>
        <Button variant="destructive" size="sm" onClick={remove}>
          Delete prompt
        </Button>
      </div>
    </div>
  );
}

export function PromptsPanel({ api = promptsApi }: { api?: PromptsApi }) {
  const id = useId();
  const [prompts, setPrompts] = useState<DeveloperPrompt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api
      .list()
      .then((list) => {
        setPrompts(list);
        setSelectedId((current) => current ?? list[0]?.id ?? null);
      })
      .catch((reason: unknown) => setError(toUserMessage(reason, 'Prompts could not be loaded.')));
  }, [api]);

  useEffect(load, [load]);

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const prompt = await api.create(name, {
        systemPrompt: '',
        template: '{{input}}',
        model: AUTO_MODEL,
        maxTokens: null,
        temperature: null,
        note: null,
      });
      setPrompts((current) => [prompt, ...(current ?? [])]);
      setSelectedId(prompt.id);
      setNewName('');
    } catch (reason) {
      setError(toUserMessage(reason, 'The prompt could not be created.'));
    } finally {
      setCreating(false);
    }
  };

  const selected = prompts?.find((prompt) => prompt.id === selectedId) ?? null;

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-foreground">Prompts and evaluations</CardTitle>
        <CardDescription>
          Keep prompts as templates with versions, test them against your own cases, and compare how
          each version does. Runs go through the gateway like any API call and use your plan.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor={`${id}-new`}>New prompt</Label>
            <Input
              id={`${id}-new`}
              value={newName}
              maxLength={DEVELOPER_PROMPT_NAME_MAX_CHARS}
              placeholder="Support reply classifier"
              onChange={(event) => setNewName(event.target.value)}
            />
          </div>
          <Button
            type="submit"
            variant="outline"
            disabled={creating || !newName.trim()}
            aria-busy={creating}
          >
            {creating ? <Spinner size="sm" className="me-2" aria-hidden="true" /> : null}
            Create
          </Button>
        </form>
        {error ? (
          <div className="flex flex-wrap items-center gap-2">
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
            <Button variant="outline" size="sm" onClick={load}>
              Try again
            </Button>
          </div>
        ) : null}
        {prompts === null && !error ? (
          <div className="flex items-center gap-2">
            <Spinner size="sm" />
            <span className="text-sm text-muted-foreground">Loading prompts…</span>
          </div>
        ) : null}
        {prompts && prompts.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-select`}>Prompt</Label>
            <select
              id={`${id}-select`}
              value={selectedId ?? ''}
              onChange={(event) => setSelectedId(event.target.value)}
              className={SELECT_CLASS}
            >
              {prompts.map((prompt) => (
                <option key={prompt.id} value={prompt.id}>
                  {prompt.name} · v{prompt.latest?.version ?? 0} · {prompt.caseCount} cases
                </option>
              ))}
            </select>
          </div>
        ) : prompts ? (
          <p className="text-sm text-muted-foreground">No prompts yet. Name one above to start.</p>
        ) : null}
        {selected ? (
          <PromptWorkspace
            key={selected.id}
            api={api}
            prompt={selected}
            onPromptChange={(next) =>
              setPrompts((current) =>
                (current ?? []).map((prompt) => (prompt.id === next.id ? next : prompt)),
              )
            }
            onDeleted={() => {
              setPrompts((current) =>
                (current ?? []).filter((prompt) => prompt.id !== selected.id),
              );
              setSelectedId(null);
            }}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
