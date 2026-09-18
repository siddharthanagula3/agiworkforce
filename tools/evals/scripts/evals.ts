/**
 * Eval harness command line.
 *
 *   replay                 grade committed recordings with no network (CI)
 *   live --model <key>     measure a registry model through its provider adapter (paid)
 *   fingerprint-reference  re-pin the hand-written reference recording to the corpora
 *
 * @module evals/scripts/evals
 * @packageDocumentation
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { SUITE_NAMES, loadDatasets } from '../src/dataset';
import {
  activeFamilies,
  measurementFileName,
  resolveLiveTarget,
  spendRefusal,
  type RegistryLike,
} from '../src/live';
import { providerResponder, type StreamingAdapter } from '../src/provider';
import { formatRun } from '../src/report';
import { caseFingerprint, parseRecording, readRecording, type Recording } from '../src/replay';
import { runLive, runReplay } from '../src/run';
import type { SuiteName } from '../src/types';

const EVALS_ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const REFERENCE_RECORDING = join(EVALS_ROOT, 'recordings', 'reference.json');
const MEASUREMENTS = join(EVALS_ROOT, 'measurements');
const REGISTRY_JSON = join(REPO_ROOT, 'packages/ai/model-registry/generated/registry.json');
const PROBE_MODELS = join(REPO_ROOT, 'scripts/probe-models.mjs');

function argValue(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function selectedSuites(args: readonly string[]): readonly SuiteName[] {
  const raw = argValue(args, '--suites');
  if (raw === undefined) return SUITE_NAMES;
  const names = raw.split(',').map((name) => name.trim());
  for (const name of names) {
    if (!(SUITE_NAMES as readonly string[]).includes(name))
      throw new Error(`unknown suite ${name}`);
  }
  return names as SuiteName[];
}

function writeJson(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function print(line: string): void {
  process.stdout.write(`${line}\n`);
}

async function replay(args: readonly string[]): Promise<void> {
  const datasets = loadDatasets(selectedSuites(args));
  const explicit = argValue(args, '--recording');
  const recordingsDir = join(MEASUREMENTS, 'recordings');
  const files =
    explicit !== undefined
      ? [explicit]
      : [
          REFERENCE_RECORDING,
          ...(existsSync(recordingsDir) ? readdirSync(recordingsDir) : [])
            .filter((entry) => entry.endsWith('.json'))
            .map((entry) => join(recordingsDir, entry)),
        ];
  let failed = false;
  for (const file of files) {
    const recording = readRecording(file);
    const outcome = await runReplay(datasets, recording);
    print(formatRun(outcome.report, outcome.reports));
    if (recording.source === 'reference' && outcome.reports.some((report) => !report.met)) {
      failed = true;
    }
  }
  if (failed) {
    process.stderr.write('[evals] the reference recording no longer meets every suite gate\n');
    process.exitCode = 1;
  }
}

async function fingerprintReference(): Promise<void> {
  const raw = JSON.parse(readFileSync(REFERENCE_RECORDING, 'utf8')) as Record<string, unknown>;
  const recording = parseRecording(raw);
  if (recording.source !== 'reference')
    throw new Error('only the reference recording is re-pinned');
  const datasets = loadDatasets(SUITE_NAMES);
  const responses: Record<string, Recording['responses'][string]> = {};
  for (const dataset of datasets) {
    for (const evalCase of dataset.cases) {
      const entry = recording.responses[evalCase.id];
      if (entry === undefined)
        throw new Error(`reference recording has no response for ${evalCase.id}`);
      responses[evalCase.id] = {
        fingerprint: caseFingerprint(dataset, evalCase.id),
        response: entry.response,
      };
    }
  }
  writeJson(REFERENCE_RECORDING, { ...raw, responses });
  print(`[evals] re-pinned ${Object.keys(responses).length} reference responses`);
}

interface ProbeAdapters {
  readonly create: (provider: string, config: { apiKey: string }) => StreamingAdapter;
  readonly isKnownProvider: (provider: string) => boolean;
}

async function live(args: readonly string[]): Promise<void> {
  const modelKey = argValue(args, '--model');
  if (modelKey === undefined) throw new Error('live requires --model <modelKey>');
  const registry = JSON.parse(readFileSync(REGISTRY_JSON, 'utf8')) as RegistryLike;
  const target = resolveLiveTarget(registry, modelKey, argValue(args, '--route'));
  const refusal = spendRefusal(registry, target, args.includes('--allow-costly'));
  if (refusal !== null) throw new Error(refusal);

  const probe = (await import(pathToFileURL(PROBE_MODELS).href)) as {
    loadProviderAdapters: () => Promise<ProbeAdapters>;
    resolveProbeAdapter: (
      entry: { provider: string; harnessId: string },
      env: NodeJS.ProcessEnv,
      adapters: ProbeAdapters,
    ) => { adapter?: StreamingAdapter; failure?: { detail: string } };
  };
  const adapters = await probe.loadProviderAdapters();
  const resolved = probe.resolveProbeAdapter(target.route, process.env, adapters);
  if (resolved.adapter === undefined) {
    throw new Error(`cannot reach ${target.routeId}: ${resolved.failure?.detail ?? 'no adapter'}`);
  }
  const adapter = resolved.adapter;

  const recordedOn = new Date().toISOString().slice(0, 10);
  const outcome = await runLive(loadDatasets(selectedSuites(args)), {
    target,
    recordedOn,
    responderFor: (dataset) =>
      providerResponder({
        adapter,
        providerModelId: target.route.providerModelId,
        dataset,
        pricing: target.route.pricing ?? null,
      }),
  });
  print(formatRun(outcome.report, outcome.reports));

  const fileName = measurementFileName(target.route.isDefault ? modelKey : target.routeId);
  writeJson(join(MEASUREMENTS, 'recordings', fileName), outcome.recording);
  writeJson(join(MEASUREMENTS, 'runs', fileName), outcome.report);
  print(`[evals] wrote measurements/recordings/${fileName} and measurements/runs/${fileName}`);

  if (args.includes('--baseline')) {
    const families = activeFamilies(registry, modelKey);
    if (families.length === 0) {
      throw new Error(
        `${modelKey} is not the active model of any family slot; no baseline written`,
      );
    }
    for (const familyId of families) {
      const baselineFile = join(MEASUREMENTS, 'baselines', measurementFileName(familyId));
      writeJson(baselineFile, { familyId, ...outcome.report });
      print(`[evals] wrote baseline for ${familyId}`);
    }
  }
}

const COMMANDS: Record<string, (args: readonly string[]) => Promise<void>> = {
  replay,
  live,
  'fingerprint-reference': fingerprintReference,
};

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const run = command === undefined ? undefined : COMMANDS[command];
  if (run === undefined) {
    process.stderr.write(`usage: evals <${Object.keys(COMMANDS).join('|')}> [options]\n`);
    process.exitCode = 2;
    return;
  }
  await run(args);
}

main().catch((error: unknown) => {
  process.stderr.write(`[evals] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
