#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const BASELINE_FILE = '.github/ci-failure-baseline.json';

const RUNS_TO_SCAN = 50;

function orderedRuns(runs) {
  return [...runs].sort((a, b) => {
    const left = Date.parse(a.created_at ?? '') || 0;
    const right = Date.parse(b.created_at ?? '') || 0;
    return right - left;
  });
}

function conclusionFor(run, gate) {
  const job = (run.jobs ?? []).find((entry) => entry.name === gate);
  return job?.conclusion ?? null;
}

export function attributeGateFailures({ baseline, runs, headSha }) {
  const all = orderedRuns(runs);
  const headIndex = headSha ? all.findIndex((run) => run.head_sha === headSha) : 0;
  if (headIndex === -1) return [];
  const ordered = all.slice(headIndex);
  const head = ordered[0];
  if (!head) return [];

  const redGates = (head.jobs ?? [])
    .filter((job) => job.conclusion === 'failure')
    .map((job) => job.name)
    .sort();

  const declared = new Map(
    (baseline.preExisting ?? []).map((entry) => [entry.gate, entry.evidence ?? null]),
  );
  const baselineIndex = ordered.findIndex((run) => run.head_sha === baseline.commit);

  return redGates.map((gate) => {
    const evidence = declared.get(gate) ?? null;
    if (baselineIndex === -1) {
      return {
        gate,
        verdict: 'unattributed',
        introducedBy: null,
        declared: declared.has(gate),
        evidence,
        reason: `The named baseline commit ${baseline.commit} is not in the last ${ordered.length} scanned runs.`,
      };
    }

    if (conclusionFor(ordered[baselineIndex], gate) === 'failure') {
      return {
        gate,
        verdict: 'pre-existing',
        introducedBy: null,
        declared: declared.has(gate),
        evidence,
        reason: `Already red at the named baseline ${baseline.commit}.`,
      };
    }

    let introducedBy = null;
    for (let index = baselineIndex - 1; index >= 0; index -= 1) {
      if (conclusionFor(ordered[index], gate) === 'failure') {
        introducedBy = ordered[index].head_sha;
        break;
      }
    }

    return introducedBy
      ? {
          gate,
          verdict: 'regression',
          introducedBy,
          declared: declared.has(gate),
          evidence,
          reason: `Green at ${baseline.commit}, first red at ${introducedBy}.`,
        }
      : {
          gate,
          verdict: 'unattributed',
          introducedBy: null,
          declared: declared.has(gate),
          evidence,
          reason: `Green at ${baseline.commit} but no scanned run records the transition to red.`,
        };
  });
}

export function formatAttributionReport({ baseline, headSha, report }) {
  if (report.length === 0) {
    return `All gates green at ${headSha}. Nothing to attribute.`;
  }

  const lines = [
    `# CI failure attribution for ${headSha}`,
    '',
    `Baseline: \`${baseline.commit}\` recorded ${baseline.recordedAt}.`,
    '',
    '| Gate | Verdict | Attribution |',
    '| --- | --- | --- |',
  ];

  for (const entry of report) {
    const attribution =
      entry.verdict === 'regression'
        ? `introduced by \`${entry.introducedBy}\``
        : entry.verdict === 'pre-existing'
          ? `pre-existing at ${baseline.commit}${entry.evidence ? `, ${entry.evidence}` : ''}`
          : entry.reason;
    lines.push(`| ${entry.gate} | ${entry.verdict} | ${attribution} |`);
  }

  const undeclared = report.filter((entry) => entry.verdict === 'pre-existing' && !entry.declared);
  if (undeclared.length > 0) {
    lines.push(
      '',
      `Undeclared pre-existing gates, add them to \`${BASELINE_FILE}\` with evidence: ${undeclared
        .map((entry) => entry.gate)
        .join(', ')}.`,
    );
  }

  const overclaimed = report.filter((entry) => entry.verdict === 'regression' && entry.declared);
  if (overclaimed.length > 0) {
    lines.push(
      '',
      `Declared pre-existing but green at the baseline, these are regressions: ${overclaimed
        .map((entry) => entry.gate)
        .join(', ')}.`,
    );
  }

  return lines.join('\n');
}

async function api(pathAndQuery, token) {
  const response = await fetch(`https://api.github.com${pathAndQuery}`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${pathAndQuery} returned ${response.status}`);
  }
  return response.json();
}

async function loadRuns(repository, token, workflowFile, branch) {
  const query = new URLSearchParams({
    branch,
    event: 'push',
    per_page: String(RUNS_TO_SCAN),
  });
  const listed = await api(
    `/repos/${repository}/actions/workflows/${workflowFile}/runs?${query}`,
    token,
  );

  const runs = [];
  for (const run of listed.workflow_runs ?? []) {
    if (run.status !== 'completed') continue;
    const jobs = await api(`/repos/${repository}/actions/runs/${run.id}/jobs?per_page=100`, token);
    runs.push({ head_sha: run.head_sha, created_at: run.created_at, jobs: jobs.jobs ?? [] });
  }
  return runs;
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!token || !repository) {
    throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY are required.');
  }

  const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
  const branch = process.env.CI_ATTRIBUTION_BRANCH ?? 'main';
  const runs = await loadRuns(repository, token, baseline.workflow, branch);
  const requestedHead = process.env.CI_ATTRIBUTION_HEAD_SHA || undefined;
  const report = attributeGateFailures({ baseline, runs, headSha: requestedHead });
  const headSha = requestedHead ?? orderedRuns(runs)[0]?.head_sha ?? 'unknown';

  process.stdout.write(`${formatAttributionReport({ baseline, headSha, report })}\n`);

  const unattributed = report.filter((entry) => entry.verdict === 'unattributed');
  if (unattributed.length > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
