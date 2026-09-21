#!/usr/bin/env node

// One live-voice state machine, implemented twice. The web session and the
// mobile session speak the same signalling protocol to the same route, so a
// server event one of them handles and the other ignores is a surface that
// silently stops advancing: the mobile client replayed a mute the web client
// dropped for months, and nothing measured the difference. This guard
// enumerates the handled events, the delegation endings and the disposal paths
// from both implementations and refuses any divergence.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const WEB_SESSION_PATH = 'apps/web/features/chat/lib/live-voice-session.ts';
export const MOBILE_SESSION_PATH = 'apps/mobile/src/features/voice/services/liveVoiceSession.ts';

/** The endings a session can reach. Each one must land on dispose(). */
export const ENDING_METHODS = ['close', 'fail'];

function read(repoRoot, relativePath) {
  try {
    return readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch {
    return null;
  }
}

/** The body of a method, by brace matching from its declaration. */
export function methodBody(source, name) {
  const declaration = new RegExp(
    `^[ \\t]*(?:private\\s+|public\\s+|protected\\s+)?(?:async\\s+)?${name}\\s*\\([^)]*\\)\\s*(?::[^{;]+)?\\{`,
    'm',
  ).exec(source);
  if (!declaration) return null;
  const open = declaration.index + declaration[0].length - 1;
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const character = source[index];
    if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  return null;
}

export function readHandledEvents(source) {
  const body = methodBody(source, 'handleMessage');
  if (body === null) return null;
  return [...body.matchAll(/case\s+'([a-z0-9_.]+)'\s*:/gi)].map((match) => match[1]).sort();
}

export function readDelegationTerminalEvents(source) {
  const start = source.indexOf('DELEGATION_TERMINAL_EVENTS');
  if (start === -1) return null;
  const open = source.indexOf('[', start);
  const close = source.indexOf(']', open);
  if (open === -1 || close === -1) return null;
  return [...source.slice(open, close).matchAll(/'([a-z0-9_.]+)'/gi)]
    .map((match) => match[1])
    .sort();
}

/** Whether a mute chosen before session.started is replayed rather than dropped. */
export function repliesPendingMute(source) {
  const setMuted = methodBody(source, 'setMuted');
  const started = methodBody(source, 'handleMessage');
  if (setMuted === null || started === null) return false;
  return /this\.pendingMuted\s*=\s*muted/.test(setMuted) && /pendingMuted/.test(started);
}

export function readDisposingEndings(source) {
  const disposing = [];
  for (const name of ENDING_METHODS) {
    const body = methodBody(source, name);
    if (body !== null && /this\.dispose\(\)/.test(body)) disposing.push(name);
  }
  const handler = methodBody(source, 'handleMessage');
  if (handler !== null) {
    const closed = handler.slice(handler.indexOf("case 'session.closed'"));
    if (/this\.dispose\(\)/.test(closed)) disposing.push('session.closed');
  }
  return disposing.sort();
}

function compare(failures, label, web, mobile) {
  if (web === null || mobile === null) {
    failures.push(`${label}: could not be read from ${web === null ? 'web' : 'mobile'}`);
    return;
  }
  const onlyWeb = web.filter((entry) => !mobile.includes(entry));
  const onlyMobile = mobile.filter((entry) => !web.includes(entry));
  if (onlyWeb.length > 0) failures.push(`${label}: only web handles ${onlyWeb.join(', ')}`);
  if (onlyMobile.length > 0)
    failures.push(`${label}: only mobile handles ${onlyMobile.join(', ')}`);
}

export function checkVoiceSessionParity(repoRoot = REPO_ROOT) {
  const failures = [];
  const web = read(repoRoot, WEB_SESSION_PATH);
  const mobile = read(repoRoot, MOBILE_SESSION_PATH);
  if (web === null || mobile === null) {
    failures.push('one of the live voice session implementations is missing');
    return failures;
  }

  compare(failures, 'server events', readHandledEvents(web), readHandledEvents(mobile));
  compare(
    failures,
    'delegation endings',
    readDelegationTerminalEvents(web),
    readDelegationTerminalEvents(mobile),
  );
  compare(failures, 'disposing endings', readDisposingEndings(web), readDisposingEndings(mobile));

  for (const [surface, source] of [
    ['web', web],
    ['mobile', mobile],
  ]) {
    const disposing = readDisposingEndings(source);
    for (const ending of [...ENDING_METHODS, 'session.closed']) {
      if (!disposing.includes(ending)) {
        failures.push(`${surface}: ${ending} ends the session without disposing it`);
      }
    }
    if (!repliesPendingMute(source)) {
      failures.push(`${surface}: a mute chosen before the session starts is dropped`);
    }
  }

  return failures;
}

function main() {
  const failures = checkVoiceSessionParity();
  if (failures.length > 0) {
    console.error('Live voice session parity failed:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log('Live voice session parity: web and mobile agree.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
