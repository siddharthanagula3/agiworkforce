'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Button, Label, Spinner, Textarea, cn, useConfirmAction } from '@agiworkforce/ui';
import {
  DEVELOPER_EVAL_CASES_MAX,
  renderPromptTemplate,
  type DeveloperEvalCase,
  type DeveloperEvalCaseInput,
  type DeveloperEvalCheckKind,
  type DeveloperEvalResult,
  type DeveloperEvalRun,
  type DeveloperPrompt,
  type DeveloperPromptVersion,
} from '@agiworkforce/cloud-contracts';

import { toUserMessage } from '@/lib/user-error-message';
import type { EvalRunSummary, PromptsApi } from '../lib/prompts-client';
import { runGatewayCompletion } from '../lib/run-completion';
import { diffLines } from '../lib/text-diff';
import { parseCasesCsv } from '../lib/cases-csv';

const RUN_CONCURRENCY = 3;
const CHECK_LABELS: Record<DeveloperEvalCheckKind, string> = {
  contains: 'Output contains the expected text',
  exact: 'Output matches the expected text exactly',
  none: 'No automatic check, grade by hand',
};
const SELECT_CLASS =
  'h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground pointer-coarse:min-h-11';

function emptyCase(variables: readonly string[]): DeveloperEvalCaseInput {
  return {
    variables: Object.fromEntries(variables.map((name) => [name, ''])),
    expectedOutput: null,
  };
}

function CaseForm({
  variables,
  onAdd,
}: {
  variables: readonly string[];
  onAdd: (input: DeveloperEvalCaseInput) => Promise<void>;
}) {
  const id = useId();
  const [draft, setDraft] = useState<DeveloperEvalCaseInput>(() => emptyCase(variables));
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(emptyCase(variables)), [variables]);
  const add = async () => {
    setSaving(true);
    try {
      await onAdd({
        variables: draft.variables,
        expectedOutput: draft.expectedOutput?.trim() ? draft.expectedOutput : null,
      });
      setDraft(emptyCase(variables));
    } finally {
      setSaving(false);
    }
  };
  return (
    <form
      aria-label="New test case"
      className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void add();
      }}
    >
      {variables.map((name) => (
        <div key={name} className="flex flex-col gap-1">
          <Label htmlFor={`${id}-${name}`} className="font-mono text-xs">
            {name}
          </Label>
          <Textarea
            id={`${id}-${name}`}
            rows={2}
            value={draft.variables[name] ?? ''}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                variables: { ...current.variables, [name]: event.target.value },
              }))
            }
          />
        </div>
      ))}
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-expected`}>Expected output (optional)</Label>
        <Textarea
          id={`${id}-expected`}
          rows={2}
          value={draft.expectedOutput ?? ''}
          onChange={(event) =>
            setDraft((current) => ({ ...current, expectedOutput: event.target.value }))
          }
        />
      </div>
      <div>
        <Button type="submit" variant="outline" size="sm" disabled={saving} aria-busy={saving}>
          Add case
        </Button>
      </div>
    </form>
  );
}

function ResultRow({
  result,
  testCase,
  onGrade,
}: {
  result: DeveloperEvalResult;
  testCase: DeveloperEvalCase | undefined;
  onGrade: (grade: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const expected = testCase?.expectedOutput ?? null;
  const verdict = result.error
    ? 'Error'
    : result.passed === true
      ? 'Pass'
      : result.passed === false
        ? 'Fail'
        : 'Not checked';
  return (
    <li className="flex flex-col gap-2 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="min-w-0 flex-1 truncate text-start text-sm text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]"
        >
          {result.renderedInput.split('\n', 1)[0] || 'Case'}
        </button>
        <span
          className={cn(
            'text-xs font-medium',
            verdict === 'Pass' && 'text-success-text',
            (verdict === 'Fail' || verdict === 'Error') && 'text-danger-text',
            verdict === 'Not checked' && 'text-muted-foreground',
          )}
        >
          {verdict}
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          {result.latencyMs !== null ? `${result.latencyMs.toLocaleString()} ms` : ''}
          {result.outputTokens !== null ? ` · ${result.outputTokens} out` : ''}
        </span>
        <select
          aria-label="Grade"
          value={result.grade ?? ''}
          onChange={(event) => onGrade(event.target.value ? Number(event.target.value) : null)}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground pointer-coarse:min-h-11"
        >
          <option value="">Grade</option>
          {[1, 2, 3, 4, 5].map((value) => (
            <option key={value} value={value}>
              {value} of 5
            </option>
          ))}
        </select>
      </div>
      {open ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Output</p>
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-md border border-border p-2 font-mono text-xs text-foreground">
              {result.error ?? result.output}
            </pre>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              {expected ? 'Expected, with the difference' : 'Input sent'}
            </p>
            <pre className="max-h-60 overflow-auto rounded-md border border-border p-2 font-mono text-xs leading-5">
              {expected && result.output !== null ? (
                diffLines(expected, result.output).map((line, index) => (
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
              ) : (
                <span className="whitespace-pre-wrap text-foreground">{result.renderedInput}</span>
              )}
            </pre>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function PromptEvaluations({
  api,
  prompt,
  versions,
  variables,
  onCasesChange,
}: {
  api: PromptsApi;
  prompt: DeveloperPrompt;
  versions: readonly DeveloperPromptVersion[];
  variables: readonly string[];
  onCasesChange: (count: number) => void;
}) {
  const id = useId();
  const { confirm, dialog } = useConfirmAction();
  const csvInput = useRef<HTMLInputElement | null>(null);
  const [cases, setCases] = useState<DeveloperEvalCase[] | null>(null);
  const [runs, setRuns] = useState<EvalRunSummary[]>([]);
  const [run, setRun] = useState<DeveloperEvalRun | null>(null);
  const [version, setVersion] = useState<number | null>(prompt.latest?.version ?? null);
  const [checkKind, setCheckKind] = useState<DeveloperEvalCheckKind>('contains');
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setVersion(prompt.latest?.version ?? null), [prompt.latest?.version]);

  const reload = useCallback(() => {
    Promise.all([api.cases(prompt.id), api.runs(prompt.id)])
      .then(([nextCases, nextRuns]) => {
        setCases(nextCases);
        setRuns(nextRuns);
      })
      .catch((reason: unknown) =>
        setError(toUserMessage(reason, 'Test cases could not be loaded.')),
      );
  }, [api, prompt.id]);

  useEffect(reload, [reload]);

  const replaceCases = (next: DeveloperEvalCase[]) => {
    setCases(next);
    onCasesChange(next.length);
  };

  const addCases = async (inputs: DeveloperEvalCaseInput[]) => {
    setError(null);
    try {
      replaceCases(await api.addCases(prompt.id, inputs));
    } catch (reason) {
      setError(toUserMessage(reason, 'The test cases could not be saved.'));
    }
  };

  const importCsv = async (file: File | undefined) => {
    if (!file) return;
    const parsed = parseCasesCsv(await file.text());
    if (csvInput.current) csvInput.current.value = '';
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    await addCases(parsed.cases);
  };

  const removeCase = (testCase: DeveloperEvalCase) =>
    confirm({
      title: 'Delete this test case?',
      description:
        'The case is removed from future runs and cannot be recovered. Results already recorded keep their output but no longer link to it.',
      confirmLabel: 'Delete case',
      destructive: true,
      onConfirm: async () => {
        try {
          await api.removeCase(prompt.id, testCase.id);
          replaceCases((cases ?? []).filter((entry) => entry.id !== testCase.id));
        } catch (reason) {
          setError(toUserMessage(reason, 'The test case could not be deleted.'));
        }
      },
    });

  const runAll = async () => {
    const chosen = versions.find((entry) => entry.version === version);
    if (!chosen || !cases || cases.length === 0) return;
    setError(null);
    let started: DeveloperEvalRun;
    try {
      started = await api.startRun(prompt.id, chosen.version, checkKind);
    } catch (reason) {
      setError(toUserMessage(reason, 'The run could not be started.'));
      return;
    }
    setRun(started);
    setRunning({ done: 0, total: cases.length });
    const queue = [...cases];
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const renderedInput = renderPromptTemplate(chosen.template, next.variables);
        let recorded: DeveloperEvalResult | null = null;
        try {
          const completion = await runGatewayCompletion({
            model: chosen.model,
            system: chosen.systemPrompt,
            message: renderedInput,
            maxTokens: chosen.maxTokens,
            temperature: chosen.temperature,
          });
          recorded = await api.recordResult(prompt.id, started.id, {
            caseId: next.id,
            renderedInput,
            output: completion.content,
            error: null,
            latencyMs: completion.latencyMs,
            inputTokens: completion.inputTokens,
            outputTokens: completion.outputTokens,
          });
        } catch (reason) {
          recorded = await api
            .recordResult(prompt.id, started.id, {
              caseId: next.id,
              renderedInput,
              output: null,
              error: toUserMessage(reason, 'The request failed.').slice(0, 2_000),
              latencyMs: null,
              inputTokens: null,
              outputTokens: null,
            })
            .catch(() => null);
        }
        if (recorded) {
          const saved = recorded;
          setRun((current) =>
            current ? { ...current, results: [...current.results, saved] } : current,
          );
        }
        setRunning((current) => (current ? { ...current, done: current.done + 1 } : current));
      }
    };
    await Promise.all(Array.from({ length: RUN_CONCURRENCY }, () => worker()));
    setRunning(null);
    setRuns(await api.runs(prompt.id).catch(() => runs));
  };

  const grade = async (result: DeveloperEvalResult, value: number | null) => {
    if (!run) return;
    try {
      const saved = await api.grade(prompt.id, run.id, result.id, value);
      setRun((current) =>
        current
          ? {
              ...current,
              results: current.results.map((entry) => (entry.id === saved.id ? saved : entry)),
            }
          : current,
      );
    } catch (reason) {
      setError(toUserMessage(reason, 'The grade could not be saved.'));
    }
  };

  const openRun = async (runId: string) => {
    try {
      setRun(await api.run(prompt.id, runId));
    } catch (reason) {
      setError(toUserMessage(reason, 'The run could not be loaded.'));
    }
  };

  const casesById = new Map((cases ?? []).map((entry) => [entry.id, entry]));

  return (
    <section aria-label="Test cases and runs" className="flex flex-col gap-3">
      {dialog}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-foreground">
          Test cases{cases ? ` · ${cases.length} of ${DEVELOPER_EVAL_CASES_MAX}` : ''}
        </h3>
        <div>
          <input
            ref={csvInput}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => void importCsv(event.target.files?.[0])}
          />
          <Button variant="outline" size="sm" onClick={() => csvInput.current?.click()}>
            Import CSV
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        A CSV has one column per variable and an optional expected column, with the names in its
        first row.
      </p>
      {cases === null && !error ? (
        <div className="flex items-center gap-2">
          <Spinner size="sm" />
          <span className="text-sm text-muted-foreground">Loading cases…</span>
        </div>
      ) : null}
      {cases && cases.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {cases.map((testCase, index) => (
            <li key={testCase.id} className="flex items-start justify-between gap-2 px-3 py-2">
              <div className="min-w-0 text-xs">
                <p className="font-medium text-foreground">Case {index + 1}</p>
                {Object.entries(testCase.variables).map(([name, value]) => (
                  <p key={name} className="truncate text-muted-foreground">
                    <span className="font-mono">{name}</span>: {value}
                  </p>
                ))}
                {testCase.expectedOutput ? (
                  <p className="truncate text-muted-foreground">
                    Expected: {testCase.expectedOutput}
                  </p>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Delete case ${index + 1}`}
                onClick={() => removeCase(testCase)}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <CaseForm variables={variables} onAdd={(input) => addCases([input])} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-version`}>Version</Label>
          <select
            id={`${id}-version`}
            value={version ?? ''}
            onChange={(event) => setVersion(Number(event.target.value))}
            className={SELECT_CLASS}
          >
            {versions.map((entry) => (
              <option key={entry.version} value={entry.version}>
                Version {entry.version}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-check`}>Check</Label>
          <select
            id={`${id}-check`}
            value={checkKind}
            onChange={(event) => setCheckKind(event.target.value as DeveloperEvalCheckKind)}
            className={SELECT_CLASS}
          >
            {(Object.keys(CHECK_LABELS) as DeveloperEvalCheckKind[]).map((kind) => (
              <option key={kind} value={kind}>
                {CHECK_LABELS[kind]}
              </option>
            ))}
          </select>
        </div>
        <Button
          className="pointer-coarse:min-h-11"
          disabled={running !== null || !cases || cases.length === 0 || version === null}
          aria-busy={running !== null}
          onClick={() => void runAll()}
        >
          {running ? <Spinner size="sm" className="me-2" aria-hidden="true" /> : null}
          {running ? `Running ${running.done} of ${running.total}` : 'Run all cases'}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      {run ? (
        <section aria-label="Run results" className="flex flex-col gap-2">
          <h4 className="text-xs font-medium text-muted-foreground">
            Version {run.version} · {run.results.length} of {run.caseCount} cases ·{' '}
            {run.results.filter((result) => result.passed === true).length} passed
          </h4>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {run.results.map((result) => (
              <ResultRow
                key={result.id}
                result={result}
                testCase={result.caseId ? casesById.get(result.caseId) : undefined}
                onGrade={(value) => void grade(result, value)}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {runs.length > 0 ? (
        <section aria-label="Earlier runs" className="flex flex-col gap-1">
          <h4 className="text-xs font-medium text-muted-foreground">Earlier runs</h4>
          <ul className="flex flex-col gap-1">
            {runs.map((summary) => (
              <li key={summary.id}>
                <button
                  type="button"
                  onClick={() => void openRun(summary.id)}
                  className="flex w-full flex-wrap justify-between gap-2 rounded-md px-2 py-1.5 text-start text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)] pointer-coarse:min-h-11"
                >
                  <span className="text-foreground">
                    Version {summary.version} · {new Date(summary.createdAt).toLocaleString()}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {summary.passed} passed · {summary.failed} failed
                    {summary.averageGrade !== null ? ` · grade ${summary.averageGrade}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
