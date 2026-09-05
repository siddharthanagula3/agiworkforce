#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_DIR = path.resolve(SCRIPT_DIR, '..', 'catalog');
const GATEWAYS_JSON = path.join(CATALOG_DIR, 'gateways.json');

const ENV_VAR_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/u;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const GATEWAY_PROTOCOLS = new Set([
  'openai_chat_completions',
  'openai_responses',
  'anthropic_messages',
]);
const SOURCE_KINDS = new Set(['static', 'remote']);
const DATA_RETENTION_CLASSES = new Set([
  'zero_retention',
  'provider_default',
  'conditional',
  'unknown',
]);
const TRAINS_ON_INPUTS_VALUES = new Set([
  'never',
  'opt_in',
  'opt_out',
  'varies_by_route',
  'unknown',
]);

function fail(errors, message) {
  errors.push(message);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function validateEnvName(errors, gatewayId, field, value) {
  if (!isNonEmptyString(value)) {
    fail(errors, `${gatewayId}.${field} must be a non-empty string`);
    return;
  }
  if (!ENV_VAR_NAME_PATTERN.test(value)) {
    fail(errors, `${gatewayId}.${field} "${value}" must be a SCREAMING_SNAKE_CASE env var name`);
  }
}

function validateSource(errors, gatewayId, field, source, { allowRequiresKey }) {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) {
    fail(errors, `${gatewayId}.${field} must be an object`);
    return;
  }
  if (!SOURCE_KINDS.has(source.kind)) {
    fail(errors, `${gatewayId}.${field}.kind must be "static" or "remote"`);
  }
  if (source.kind === 'remote') {
    if (!isNonEmptyString(source.path) || !source.path.startsWith('/')) {
      fail(
        errors,
        `${gatewayId}.${field}.path is required for a remote source and must start with "/"`,
      );
    }
    if (
      allowRequiresKey &&
      source.requiresKey !== undefined &&
      typeof source.requiresKey !== 'boolean'
    ) {
      fail(errors, `${gatewayId}.${field}.requiresKey must be a boolean when present`);
    }
  } else if (source.path !== undefined) {
    fail(errors, `${gatewayId}.${field}.path must be omitted for a static source`);
  }
  const allowedKeys = new Set(['kind', 'path', ...(allowRequiresKey ? ['requiresKey'] : [])]);
  for (const key of Object.keys(source)) {
    if (!allowedKeys.has(key)) fail(errors, `${gatewayId}.${field} has unsupported key "${key}"`);
  }
}

function validateGovernance(errors, gatewayId, governance) {
  if (governance === null || typeof governance !== 'object' || Array.isArray(governance)) {
    fail(errors, `${gatewayId}.governance must be an object`);
    return;
  }
  if (!DATA_RETENTION_CLASSES.has(governance.dataRetentionClass)) {
    fail(
      errors,
      `${gatewayId}.governance.dataRetentionClass "${governance.dataRetentionClass}" is not a known class`,
    );
  }
  if (!TRAINS_ON_INPUTS_VALUES.has(governance.trainsOnInputs)) {
    fail(
      errors,
      `${gatewayId}.governance.trainsOnInputs "${governance.trainsOnInputs}" is not a known value`,
    );
  }
  const hasAnyVerifiedField =
    governance.source !== undefined ||
    governance.verifiedOn !== undefined ||
    governance.note !== undefined;
  if (hasAnyVerifiedField) {
    if (!isNonEmptyString(governance.source) || !governance.source.startsWith('https://')) {
      fail(
        errors,
        `${gatewayId}.governance.source must be an https:// URL once any governance field is verified`,
      );
    }
    if (!isNonEmptyString(governance.verifiedOn) || !ISO_DATE_PATTERN.test(governance.verifiedOn)) {
      fail(
        errors,
        `${gatewayId}.governance.verifiedOn must be an ISO calendar day once any governance field is verified`,
      );
    }
  }
}

function validateHost(errors, gatewayId, host) {
  if (!isNonEmptyString(host)) {
    fail(errors, `${gatewayId}.host must be a non-empty string`);
    return;
  }
  if (host.includes('://') || host.includes('/') || host.includes(' ')) {
    fail(errors, `${gatewayId}.host "${host}" must be a bare hostname, not a URL`);
  }
}

export function validateGatewayDefinition(gatewayId, gateway, errors) {
  if (gateway.id !== gatewayId) {
    fail(errors, `gateways.${gatewayId}.id ("${gateway.id}") must equal its own key`);
  }
  if (!isNonEmptyString(gateway.displayName)) {
    fail(errors, `${gatewayId}.displayName must be a non-empty string`);
  }
  if (!GATEWAY_PROTOCOLS.has(gateway.protocol)) {
    fail(
      errors,
      `${gatewayId}.protocol "${gateway.protocol}" is not one of ${[...GATEWAY_PROTOCOLS].join(', ')}`,
    );
  }
  validateEnvName(errors, gatewayId, 'baseUrlEnv', gateway.baseUrlEnv);
  validateEnvName(errors, gatewayId, 'apiKeyEnv', gateway.apiKeyEnv);
  if (gateway.extraHeaderEnvs !== undefined) {
    if (typeof gateway.extraHeaderEnvs !== 'object' || gateway.extraHeaderEnvs === null) {
      fail(errors, `${gatewayId}.extraHeaderEnvs must be an object when present`);
    } else {
      for (const [headerName, envName] of Object.entries(gateway.extraHeaderEnvs)) {
        if (!isNonEmptyString(headerName)) {
          fail(errors, `${gatewayId}.extraHeaderEnvs has an empty header name`);
        }
        validateEnvName(errors, gatewayId, `extraHeaderEnvs.${headerName}`, envName);
      }
    }
  }
  validateSource(errors, gatewayId, 'modelsSource', gateway.modelsSource, {
    allowRequiresKey: true,
  });
  validateSource(errors, gatewayId, 'pricingSource', gateway.pricingSource, {
    allowRequiresKey: false,
  });
  validateHost(errors, gatewayId, gateway.host);
  validateGovernance(errors, gatewayId, gateway.governance);
}

export function validateGatewaysCatalog(catalog) {
  const errors = [];
  if (catalog === null || typeof catalog !== 'object' || Array.isArray(catalog)) {
    return ['gateways.json must contain a JSON object'];
  }
  if (
    catalog.gateways === null ||
    typeof catalog.gateways !== 'object' ||
    Array.isArray(catalog.gateways)
  ) {
    return ['gateways.json must declare a "gateways" object'];
  }
  const endpoints = new Map();
  const baseUrlEnvs = new Map();
  for (const [gatewayId, gateway] of Object.entries(catalog.gateways)) {
    validateGatewayDefinition(gatewayId, gateway ?? {}, errors);
    if (isNonEmptyString(gateway?.host)) {
      const endpoint = `${gateway.host}|${gateway.protocol}`;
      const owner = endpoints.get(endpoint);
      if (owner && owner !== gatewayId) {
        fail(
          errors,
          `host "${gateway.host}" is declared twice for protocol ${gateway.protocol}, by ${owner} and ${gatewayId}`,
        );
      }
      endpoints.set(endpoint, gatewayId);
      const baseUrlOwner = baseUrlEnvs.get(gateway.baseUrlEnv);
      if (baseUrlOwner && baseUrlOwner !== gatewayId) {
        fail(
          errors,
          `${gatewayId}.baseUrlEnv "${gateway.baseUrlEnv}" is already claimed by ${baseUrlOwner}`,
        );
      }
      baseUrlEnvs.set(gateway.baseUrlEnv, gatewayId);
    }
  }
  return errors;
}

function main() {
  const catalog = JSON.parse(fs.readFileSync(GATEWAYS_JSON, 'utf8'));
  const errors = validateGatewaysCatalog(catalog);
  if (errors.length > 0) {
    process.stderr.write(`[validate-gateways] ✗ ${errors.length} issue(s):\n`);
    for (const error of errors) process.stderr.write(`  - ${error}\n`);
    process.exitCode = 1;
    return;
  }
  const count = Object.keys(catalog.gateways).length;
  process.stdout.write(`[validate-gateways] ✓ ${count} gateway definition(s) valid.\n`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
