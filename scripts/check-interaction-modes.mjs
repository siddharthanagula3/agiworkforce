#!/usr/bin/env node

// One vocabulary for the ways a person addresses the product. A mode used to be
// three unrelated things: an enum on the conversation, a composer boolean, and a
// surface with its own route, so nothing could say which modes exist, where each
// is selected, what request carries it, or which gate withholds it. This guard
// enumerates the modes from the registry and resolves each of those three
// bindings against its own source of truth: the composer and menu sources, the
// chat request schema, the plan catalog and the feature registry.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const REGISTRY_PATH = 'packages/contracts/types/src/interaction-modes.json';
export const CONTRACT_PATH = 'packages/contracts/types/src/interaction-modes.ts';
export const BILLING_PATH = 'packages/contracts/types/src/billing-catalog.ts';
export const MODEL_CATALOG_PATH = 'packages/contracts/types/src/model-catalog.ts';
export const SUITE_PATH = 'packages/contracts/types/src/suite-contracts.ts';
export const FEATURE_REGISTRY_PATH = 'packages/contracts/types/src/feature-registry.json';
export const CHAT_REQUEST_PATH =
  'apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts';

/** Checklist 1.9: what every mode has to answer for, beyond its id. */
export const REQUIRED_ATTRIBUTES = [
  'label',
  'description',
  'selector',
  'request',
  'gates',
  'models',
  'requiredModelCapabilities',
  'requiredTools',
  'optionalTools',
  'sourceBehavior',
  'fileBehavior',
  'memoryBehavior',
  'projectBehavior',
  'approvalBehavior',
  'streamingFormat',
  'persistence',
  'backgroundExecution',
  'usageAccounting',
  'billing',
  'cancellation',
  'resume',
  'crossDevice',
  'offline',
  'trustModes',
  'enterprisePolicy',
  'outputTypes',
  'draft',
];

/** The traits `interactionModeTransition` derives every pair rule from. */
export const TRANSITION_TRAITS = [
  'draft',
  'fileBehavior',
  'memoryBehavior',
  'projectBehavior',
  'sourceBehavior',
  'persistence',
  'streamingFormat',
  'trustModes',
];

function read(repoRoot, relativePath) {
  try {
    return readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch {
    return null;
  }
}

function objectKeys(source, declaration) {
  const start = source.indexOf(declaration);
  if (start === -1) return null;
  const open = source.indexOf('{', start);
  if (open === -1) return null;
  let depth = 0;
  let end = -1;
  for (let i = open; i < source.length; i += 1) {
    const character = source[i];
    if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return null;
  const body = source.slice(open + 1, end);
  const keys = [];
  let depthInBody = 0;
  let line = '';
  for (const character of body) {
    if (character === '{' || character === '[' || character === '(') depthInBody += 1;
    if (character === '}' || character === ']' || character === ')') depthInBody -= 1;
    if (character === '\n') {
      if (depthInBody === 0) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/);
        if (match) keys.push(match[1]);
      }
      line = '';
      continue;
    }
    line += character;
  }
  return keys;
}

function quotedList(source, declaration) {
  const start = source.indexOf(declaration);
  if (start === -1) return null;
  const open = source.indexOf('[', start);
  if (open === -1) return null;
  const close = source.indexOf(']', open);
  if (close === -1) return null;
  return [...source.slice(open, close).matchAll(/'([a-z_-]+)'/g)].map((match) => match[1]);
}

export function collectViolations(repoRoot = REPO_ROOT) {
  const violations = [];
  const fail = (message) => violations.push(message);

  const registryRaw = read(repoRoot, REGISTRY_PATH);
  if (!registryRaw) {
    fail(`${REGISTRY_PATH} is missing: the interaction-mode vocabulary has no source of truth.`);
    return violations;
  }

  let registry;
  try {
    registry = JSON.parse(registryRaw);
  } catch (error) {
    fail(`${REGISTRY_PATH} is not valid JSON: ${error.message}`);
    return violations;
  }

  const modes = registry.modes ?? {};
  const ids = Object.keys(modes);
  if (ids.length === 0) {
    fail(`${REGISTRY_PATH} declares no modes.`);
    return violations;
  }

  const contract = read(repoRoot, CONTRACT_PATH);
  if (!contract) fail(`${CONTRACT_PATH} is missing: nothing types the registry.`);
  else if (!contract.includes('interaction-modes.json')) {
    fail(`${CONTRACT_PATH} does not read ${REGISTRY_PATH}: it has a second copy of the list.`);
  }

  const billing = read(repoRoot, BILLING_PATH);
  const capabilities = billing ? (objectKeys(billing, 'BILLING_PLAN_CAPABILITY_TIERS') ?? []) : [];
  if (capabilities.length === 0) fail(`Could not read the plan capabilities from ${BILLING_PATH}.`);

  const catalog = read(repoRoot, MODEL_CATALOG_PATH);
  const modelCapabilities = catalog ? (objectKeys(catalog, 'COMPAT_CAPABILITY_SOURCES') ?? []) : [];
  if (modelCapabilities.length === 0) {
    fail(`Could not read the model capabilities from ${MODEL_CATALOG_PATH}.`);
  }

  const suite = read(repoRoot, SUITE_PATH);
  const privacyModes = suite ? (quotedList(suite, 'PRIVACY_MODES') ?? []) : [];
  if (privacyModes.length === 0) fail(`Could not read the trust boundaries from ${SUITE_PATH}.`);

  let features = [];
  const featureRaw = read(repoRoot, FEATURE_REGISTRY_PATH);
  if (featureRaw) {
    try {
      features = Object.keys(JSON.parse(featureRaw).features ?? {});
    } catch {
      fail(`${FEATURE_REGISTRY_PATH} is not valid JSON.`);
    }
  }

  const chatRequest = read(repoRoot, CHAT_REQUEST_PATH);
  const requestFields = chatRequest
    ? (objectKeys(chatRequest, 'ChatCompletionRequestSchema') ?? [])
    : [];
  if (requestFields.length === 0) {
    fail(`Could not read the chat request schema from ${CHAT_REQUEST_PATH}.`);
  }

  for (const id of ids) {
    const mode = modes[id];
    const where = `${REGISTRY_PATH} mode "${id}"`;

    for (const attribute of REQUIRED_ATTRIBUTES) {
      if (mode[attribute] === undefined) fail(`${where} does not define "${attribute}".`);
    }
    for (const trait of TRANSITION_TRAITS) {
      if (mode[trait] === undefined) {
        fail(`${where} is missing "${trait}", so no transition rule can be derived for it.`);
      }
    }

    const selector = mode.selector ?? {};
    if (!selector.file) {
      fail(`${where} names no selector: nothing lets a user enter it.`);
    } else {
      const selectorSource = read(repoRoot, selector.file);
      if (selectorSource === null) fail(`${where} selector file ${selector.file} does not exist.`);
      else {
        if (selector.marker && !selectorSource.includes(selector.marker)) {
          fail(`${where} selector ${selector.marker} is not in ${selector.file}.`);
        }
        if (selector.label && !selectorSource.includes(selector.label)) {
          fail(`${where} selector label "${selector.label}" is not rendered by ${selector.file}.`);
        }
      }
    }

    const request = mode.request ?? {};
    if (request.kind === 'chat-completions') {
      if (requestFields.length > 0 && !requestFields.includes(request.field)) {
        fail(`${where} sends "${request.field}", which the chat request schema does not accept.`);
      }
    } else if (request.kind === 'route') {
      const routeFile = path.join(request.route ?? '', 'route.ts');
      if (!existsSync(path.join(repoRoot, routeFile))) {
        fail(`${where} is served by ${routeFile}, which does not exist.`);
      }
    } else {
      fail(`${where} declares an unknown request kind "${request.kind}".`);
    }

    const gates = mode.gates ?? {};
    if (capabilities.length > 0 && !capabilities.includes(gates.entitlement)) {
      fail(`${where} is gated on "${gates.entitlement}", which the plan catalog does not define.`);
    }
    if (capabilities.length > 0 && !capabilities.includes(mode.billing)) {
      fail(`${where} bills as "${mode.billing}", which the plan catalog does not define.`);
    }
    if (gates.feature !== null && features.length > 0 && !features.includes(gates.feature)) {
      fail(`${where} names feature "${gates.feature}", which the feature registry does not have.`);
    }

    for (const capability of mode.requiredModelCapabilities ?? []) {
      if (modelCapabilities.length > 0 && !modelCapabilities.includes(capability)) {
        fail(`${where} requires model capability "${capability}", which no model can report.`);
      }
    }

    const trustModes = mode.trustModes ?? [];
    if (trustModes.length === 0) fail(`${where} names no trust boundary it may run in.`);
    for (const trustMode of trustModes) {
      if (privacyModes.length > 0 && !privacyModes.includes(trustMode)) {
        fail(`${where} runs in trust boundary "${trustMode}", which does not exist.`);
      }
    }

    if (typeof mode.description !== 'string' || mode.description.trim().length === 0) {
      fail(`${where} has no description for its selector to show.`);
    }
  }

  return violations;
}

function main() {
  const violations = collectViolations();
  if (violations.length > 0) {
    console.error('Interaction-mode registry violations:');
    for (const violation of violations) console.error(`  - ${violation}`);
    console.error(`\n${violations.length} violation(s).`);
    process.exit(1);
  }
  console.log('Interaction modes: every mode is selectable, requestable and gated.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
