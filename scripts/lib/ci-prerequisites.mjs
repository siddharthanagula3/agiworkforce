import { appendFileSync } from 'node:fs';

export function missingEnvironment(names, env) {
  return names.filter((name) => !env[name]?.trim());
}

export function reportNotRun(
  { title, reason, unblockedBy, flawId, details = '' },
  { env = process.env, log = console.log } = {},
) {
  const message = `NOT RUN: ${title}. ${reason} Unblocked by: ${unblockedBy} (${flawId})`;
  const escaped = message.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
  log(`::warning::${escaped}`);
  const summary = [
    `## NOT RUN: ${title}`,
    '',
    reason,
    '',
    `Unblocked by: ${unblockedBy}`,
    '',
    `Tracked in audit/registers/known-flaws.md: ${flawId}.`,
    ...(details ? ['', details] : []),
    '',
  ].join('\n');
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${summary}\n`);
}
