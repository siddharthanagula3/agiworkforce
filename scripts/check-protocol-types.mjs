#!/usr/bin/env node
// Cross-language parity for the protocol types, without running cargo.
// `generate-protocol-types.mjs --check` covers the canonical tree against Rust;
// this covers the crate's mirror tree and the hand-written mirrors beyond it.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const CANONICAL_DIR = path.join(
  'packages',
  'contracts',
  'types',
  'src',
  'generated',
  'protocol',
);
export const CRATE_BINDINGS_DIR = path.join('crates', 'agiworkforce-protocol', 'bindings');
export const CAPABILITY_CONSUMER = path.join(
  'apps',
  'extension-vscode',
  'src',
  'integrations',
  'localRuntimeClient.ts',
);
export const TOOL_PRIMITIVE = path.join(
  'packages',
  'contracts',
  'types',
  'src',
  'tool-primitive.ts',
);

// ts-rs and prettier disagree about quotes, member separators and line breaks,
// so the two trees are compared by what they declare rather than byte for byte.
export function normalizeDeclaration(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/"/g, "'")
    .replace(/\s+/g, '')
    .replace(/,/g, ';')
    .replace(/;+([}\]>)])/g, '$1')
    .replace(/=\|/g, '=')
    .replace(/'(\w+)':/g, '$1:')
    .replace(/\(\{([^{}]*)\}&(\w+)\)/g, '{$1}&$2')
    .trim();
}

export function collectModules(dir) {
  const modules = new Map();
  const walk = (current, prefix) => {
    if (!fs.existsSync(current)) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort()) {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(next, `${prefix}${entry.name}/`);
      } else if (entry.name.endsWith('.ts') && entry.name !== 'index.ts') {
        modules.set(`${prefix}${entry.name}`, fs.readFileSync(next, 'utf8'));
      }
    }
  };
  walk(dir, '');
  return modules;
}

export function compareTrees(canonical, mirror) {
  const problems = [];
  for (const name of canonical.keys()) {
    if (!mirror.has(name)) problems.push(`${name} is generated but missing from the crate tree`);
  }
  for (const name of mirror.keys()) {
    if (!canonical.has(name)) problems.push(`${name} is in the crate tree but no longer generated`);
  }
  for (const [name, source] of canonical) {
    const other = mirror.get(name);
    if (other === undefined) continue;
    if (normalizeDeclaration(source) !== normalizeDeclaration(other)) {
      problems.push(`${name} declares a different shape in the two trees`);
    }
  }
  return problems;
}

export function fieldsOfGeneratedType(source, typeName) {
  const pattern = new RegExp(`export type ${typeName} = \\{([\\s\\S]*?)\\n\\};`);
  const body = source.match(pattern)?.[1];
  if (!body) return null;
  const withoutComments = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  return [...withoutComments.matchAll(/^\s*(\w+)\??:/gm)].map((match) => match[1]);
}

export function zodObjectKeys(source, constName) {
  const pattern = new RegExp(`const ${constName} = z\\.object\\(\\{([\\s\\S]*?)\\n\\}\\);`);
  const body = source.match(pattern)?.[1];
  if (!body) return null;
  return [...body.matchAll(/^\s*(\w+):/gm)].map((match) => match[1]);
}

export function compareVocabulary(label, owned, mirrored) {
  if (owned === null) return [`${label}: the Rust-owned shape could not be read`];
  if (mirrored === null) return [`${label}: the hand-written mirror could not be read`];
  const problems = [];
  const mirroredSet = new Set(mirrored);
  const ownedSet = new Set(owned);
  for (const name of owned) {
    if (!mirroredSet.has(name))
      problems.push(`${label}: ${name} is owned by Rust but not mirrored`);
  }
  for (const name of mirrored) {
    if (!ownedSet.has(name))
      problems.push(`${label}: ${name} is mirrored but Rust declares no such member`);
  }
  return problems;
}

export function stringUnionMembers(source, typeName) {
  const declaration = source.match(new RegExp(`export type ${typeName} =([\\s\\S]*?);`))?.[1];
  if (!declaration || !/^\s*'/.test(declaration)) return null;
  return [...declaration.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

export function runtimeListing(source, typeName) {
  const pattern = new RegExp(`listing<${typeName}>\\(\\)\\(\\[([\\s\\S]*?)\\]\\)`);
  const body = source.match(pattern)?.[1];
  if (body === undefined) return null;
  return [...body.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

export function checkToolUnions(canonical, toolPrimitive) {
  const problems = [];
  for (const [file, source] of canonical) {
    const typeName = path.basename(file, '.ts');
    if (!typeName.startsWith('Tool')) continue;
    const members = stringUnionMembers(source, typeName);
    if (members === null) continue;
    const listed = runtimeListing(toolPrimitive, typeName);
    if (listed === null) {
      problems.push(
        `${typeName} is a generated tool vocabulary with no listing<${typeName}>() in ${TOOL_PRIMITIVE}`,
      );
      continue;
    }
    problems.push(...compareVocabulary(typeName, members, listed));
  }
  return problems;
}

export function checkProtocolTypes(root = repoRoot) {
  const read = (relative) => {
    const absolute = path.join(root, relative);
    return fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : null;
  };
  const canonical = collectModules(path.join(root, CANONICAL_DIR));
  if (canonical.size === 0) {
    return { problems: [`${CANONICAL_DIR} holds no generated modules`], checked: 0 };
  }
  const mirror = collectModules(path.join(root, CRATE_BINDINGS_DIR));
  const problems = compareTrees(canonical, mirror);

  const capabilities = canonical.get('AppServerCapabilities.ts');
  problems.push(
    ...compareVocabulary(
      'AppServerCapabilities',
      capabilities ? fieldsOfGeneratedType(capabilities, 'AppServerCapabilities') : null,
      zodObjectKeys(read(CAPABILITY_CONSUMER) ?? '', 'capabilitiesSchema'),
    ),
  );

  problems.push(...checkToolUnions(canonical, read(TOOL_PRIMITIVE) ?? ''));
  return { problems, checked: canonical.size };
}

export const CLI_USAGE_SUMMARY = path.join('apps', 'cli', 'src', 'usage_summary.rs');
export const CLI_COST_LEDGER = path.join('apps', 'cli', 'src', 'cost_ledger.rs');
export const CLI_TIER_CACHE = path.join('apps', 'cli', 'src', 'tier_cache.rs');
export const LLM_ERROR = path.join('crates', 'agiworkforce-llm', 'src', 'error.rs');
export const CLI_PLANS = path.join('apps', 'cli', 'src', 'plans.rs');
export const MANAGED_USAGE_LIMITS_OWNER = path.join(
  'packages',
  'contracts',
  'types',
  'src',
  'managed-usage-limits.ts',
);
export const WEB_USAGE_ATTRIBUTION = path.join(
  'apps',
  'web',
  'lib',
  'billing',
  'usage-attribution.ts',
);
export const MANAGED_USAGE_BALANCE = path.join(
  'packages',
  'contracts',
  'types',
  'src',
  'managed-usage-balance.ts',
);
export const CREDITS_CONTRACT = path.join('packages', 'contracts', 'types', 'src', 'credits.ts');
export const SUBSCRIPTION_ENTITLEMENT = path.join(
  'packages',
  'contracts',
  'types',
  'src',
  'subscription-entitlement.ts',
);
export const BILLING_CATALOG = path.join(
  'packages',
  'contracts',
  'types',
  'src',
  'billing-catalog.ts',
);
export const USAGE_HISTORY_OWNER = path.join(
  'packages',
  'contracts',
  'types',
  'src',
  'account-usage-wire.ts',
);
export const USAGE_AGGREGATION_OWNER = path.join(
  'apps',
  'web',
  'lib',
  'services',
  'usage-aggregation.ts',
);

export const CLI_USAGE_MIRRORS = [
  { rust: 'AccountUsage', owner: MANAGED_USAGE_BALANCE, type: 'ManagedUsageSummaryResponse' },
  { rust: 'UsageCreditWindow', owner: MANAGED_USAGE_BALANCE, type: 'ManagedUsageCreditWindow' },
  { rust: 'PurchasedCredits', owner: MANAGED_USAGE_BALANCE, type: 'ManagedUsagePurchasedCredits' },
  { rust: 'UsageCredits', owner: MANAGED_USAGE_BALANCE, type: 'ManagedUsageCredits' },
  { rust: 'UsageHistory', owner: USAGE_HISTORY_OWNER, type: 'AccountUsageHistoryResponse' },
  { rust: 'UsageHistoryTotals', owner: USAGE_HISTORY_OWNER, type: 'AccountUsageTotals' },
  { rust: 'UsageHistoryPeriod', owner: USAGE_HISTORY_OWNER, type: 'AccountUsagePeriodRow' },
  { rust: 'UsageHistoryBreakdown', owner: USAGE_HISTORY_OWNER, type: 'AccountUsageBreakdownRow' },
  { rust: 'UsageHistoryFreshness', owner: USAGE_AGGREGATION_OWNER, type: 'UsageFreshness' },
];

const CLI_LOCAL_MODE_TIERS = new Set(['byok']);

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function camelCase(name) {
  return name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

export function rustStructFields(source, structName) {
  const pattern = new RegExp(
    `((?:#\\[[^\\]]*\\]\\s*)*)pub struct ${structName} \\{([\\s\\S]*?)\\n\\}`,
  );
  const match = source.match(pattern);
  if (!match) return null;
  const renamesToCamel = /rename_all\s*=\s*"camelCase"/.test(match[1]);
  const fields = [...stripComments(match[2]).matchAll(/^\s*pub (\w+):/gm)].map((field) => field[1]);
  return renamesToCamel ? fields.map(camelCase) : fields;
}

export function tsInterfaceFields(source, interfaceName) {
  const pattern = new RegExp(
    `export interface ${interfaceName}(?: extends ([\\w, ]+))? \\{([\\s\\S]*?)\\n\\}`,
  );
  const match = source.match(pattern);
  if (!match) return null;
  const own = [...stripComments(match[2]).matchAll(/^\s*(\w+)\??:/gm)].map((field) => field[1]);
  const inherited = [];
  for (const parent of (match[1] ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)) {
    const fields = tsInterfaceFields(source, parent);
    if (fields === null) return null;
    inherited.push(...fields);
  }
  return [...inherited, ...own];
}

function readNumber(literal) {
  const value = Number(literal.replace(/_/g, ''));
  return Number.isFinite(value) ? value : null;
}

export function tsConstNumber(source, name) {
  const literal = source.match(new RegExp(`export const ${name} = ([\\d_.]+);`))?.[1];
  return literal === undefined ? null : readNumber(literal);
}

export function rustConstNumber(source, name) {
  const literal = source.match(new RegExp(`const ${name}: \\w+ = ([\\d_.]+);`))?.[1];
  return literal === undefined ? null : readNumber(literal);
}

export function tsConstStrings(source, name) {
  const body = source.match(new RegExp(`export const ${name} = \\[([^\\]]*)\\]`))?.[1];
  return body === undefined ? null : [...body.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

export function rustConstStrings(source, name) {
  const body = source.match(new RegExp(`const ${name}: \\[&str; \\d+\\] = \\[([^\\]]*)\\]`))?.[1];
  return body === undefined ? null : [...body.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function rustMatchArms(source, functionName) {
  const body = source.match(
    new RegExp(`fn ${functionName}\\([^)]*\\)[^{]*\\{([\\s\\S]*?)\\n\\s{0,4}\\}`),
  )?.[1];
  if (body === undefined) return null;
  return new Map(
    [...body.matchAll(/UserTier::(\w+) => "([^"]+)"/g)].map((match) => [match[1], match[2]]),
  );
}

export function rustTierLabels(source) {
  const labels = rustMatchArms(source, 'label');
  const ids = rustMatchArms(source, 'tier_to_str');
  if (labels === null || ids === null || labels.size === 0 || ids.size === 0) return null;
  const byTier = new Map();
  for (const [variant, id] of ids) {
    if (labels.has(variant)) byTier.set(id, labels.get(variant));
  }
  return byTier;
}

export function tsUsageLimitCodes(source) {
  const body = source.match(
    /const MANAGED_QUOTA_BLOCKS[\s\S]*?Object\.freeze\(\s*\{([\s\S]*?)\n\s*\}\s*,?\s*\);/,
  )?.[1];
  if (body === undefined) return null;
  const blocks = [...body.matchAll(/^\s*(\w+): \{\s*kind: '(\w+)'/gm)];
  if (blocks.length === 0) return null;
  return blocks.filter((block) => block[2] !== 'rate_limit').map((block) => block[1]);
}

export function rustStringPairs(source, name) {
  const body = source.match(new RegExp(`const ${name}: [^=]+= \\[([\\s\\S]*?)\\];`))?.[1];
  if (body === undefined) return null;
  const pairs = new Map(
    [...body.matchAll(/\(\s*"([^"]+)",\s*"([^"]+)",?\s*\)/g)].map((match) => [match[1], match[2]]),
  );
  return pairs.size === 0 ? null : pairs;
}

export function tsStringMap(source, name) {
  const body = source.match(
    new RegExp(`const ${name}[^=]*=\\s*(?:Object\\.freeze\\(\\s*)?\\{([\\s\\S]*?)\\n\\s*\\}\\)?;`),
  )?.[1];
  if (body === undefined) return null;
  const entries = new Map(
    [...body.matchAll(/^\s*'?([\w-]+)'?: '([^']*)',?$/gm)].map((match) => [match[1], match[2]]),
  );
  return entries.size === 0 ? null : entries;
}

function listMembers(literal, quote) {
  return [...literal.matchAll(new RegExp(`${quote}([^${quote}]+)${quote}`, 'g'))].map(
    (match) => match[1],
  );
}

export function rustCapabilityTiers(source) {
  const lists = new Map(
    [...source.matchAll(/const (\w+): &\[&str\] = &\[([^\]]*)\];/g)].map((match) => [
      match[1],
      listMembers(match[2], '"'),
    ]),
  );
  const body = source.match(/const PLAN_CAPABILITY_TIERS: [^=]+= \[([\s\S]*?)\n\];/)?.[1];
  if (body === undefined) return null;
  const tiers = new Map();
  for (const match of body.matchAll(/\(\s*"(\w+)",\s*(?:(\w+)|&\[([^\]]*)\])\s*,?\s*\)/g)) {
    const members = match[2] ? lists.get(match[2]) : listMembers(match[3], '"');
    if (members === undefined) return null;
    tiers.set(match[1], members);
  }
  return tiers.size === 0 ? null : tiers;
}

export function tsCapabilityTiers(source) {
  const lists = new Map(
    [...source.matchAll(/const (\w+) = \[([^\]]*)\] as const;/g)].map((match) => [
      match[1],
      listMembers(match[2], "'"),
    ]),
  );
  const body = source.match(
    /export const BILLING_PLAN_CAPABILITY_TIERS[\s\S]*?Object\.freeze\(\{([\s\S]*?)\n\}\);/,
  )?.[1];
  if (body === undefined) return null;
  const tiers = new Map();
  for (const match of body.matchAll(/^\s*(\w+): (?:(\w+)|\[([^\]]*)\]),?$/gm)) {
    const members = match[2] ? lists.get(match[2]) : listMembers(match[3], "'");
    if (members === undefined) return null;
    tiers.set(match[1], members);
  }
  return tiers.size === 0 ? null : tiers;
}

export function rustPlanWindowCredits(source) {
  const body = source.match(/const PLAN_WINDOW_CREDITS: [^=]+= \[([\s\S]*?)\];/)?.[1];
  if (body === undefined) return null;
  const credits = new Map(
    [...body.matchAll(/\(\s*"([\w-]+)",\s*([\d_]+),\s*([\d_]+),\s*([\d_]+),?\s*\)/g)].map(
      (match) => [match[1], [match[2], match[3], match[4]].map(readNumber).join('/')],
    ),
  );
  return credits.size === 0 ? null : credits;
}

export function tsPlanWindowCredits(source) {
  const credits = new Map(
    [
      ...source.matchAll(
        /^\s*'?([\w-]+)'?: \{\s*monthlyCredits: ([\d_]+),\s*weeklyCredits: ([\d_]+),\s*fiveHourCredits: ([\d_]+),/gm,
      ),
    ].map((match) => [match[1], [match[4], match[3], match[2]].map(readNumber).join('/')]),
  );
  return credits.size === 0 ? null : credits;
}

export function tsPerSeatPlans(source) {
  const pricing = source.match(/export const BILLING_PLAN_PRICING = \{([\s\S]*?)\n\}/)?.[1];
  if (pricing === undefined) return null;
  return [...pricing.matchAll(/id: '([\w-]+)',[^}]*?perSeat: true/g)].map((match) => match[1]);
}

function compareMaps(label, owned, mirrored, describe = (value) => JSON.stringify(value)) {
  if (owned === null || mirrored === null) {
    return [`${label}: the table could not be read on both sides`];
  }
  const problems = [];
  for (const [key, value] of owned) {
    if (!mirrored.has(key)) problems.push(`${label}: ${key} is missing from the mirror`);
    else if (describe(mirrored.get(key)) !== describe(value)) {
      problems.push(
        `${label}: ${key} is ${describe(mirrored.get(key))} in the mirror, ${describe(value)} in the owner`,
      );
    }
  }
  for (const key of mirrored.keys()) {
    if (!owned.has(key)) problems.push(`${label}: ${key} is no longer in the owner`);
  }
  return problems;
}

export function tsPlanLabels(source) {
  const labels = new Map(
    [...source.matchAll(/id: '([\w-]+)',\s*label: '([^']+)'/g)].map((match) => [
      match[1],
      match[2],
    ]),
  );
  return labels.size === 0 ? null : labels;
}

function compareMirrorFields(label, owned, mirrored) {
  if (owned === null) return [`${label}: the owning TypeScript shape could not be read`];
  if (mirrored === null) return [`${label}: the CLI mirror could not be read`];
  const ownedSet = new Set(owned);
  return mirrored
    .filter((field) => !ownedSet.has(field))
    .map((field) => `${label}: the CLI reads ${field}, which the owner no longer declares`);
}

export function checkCliUsageMirror(root = repoRoot) {
  const read = (relative) => {
    const absolute = path.join(root, relative);
    return fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : null;
  };
  const problems = [];
  const usageSummary = read(CLI_USAGE_SUMMARY) ?? '';

  for (const mirror of CLI_USAGE_MIRRORS) {
    problems.push(
      ...compareMirrorFields(
        `${mirror.rust} (${mirror.type})`,
        tsInterfaceFields(read(mirror.owner) ?? '', mirror.type),
        rustStructFields(usageSummary, mirror.rust),
      ),
    );
  }

  const ownedCredit = tsConstNumber(read(CREDITS_CONTRACT) ?? '', 'MICROUSD_PER_CREDIT');
  const mirroredCredit = rustConstNumber(read(CLI_COST_LEDGER) ?? '', 'MICROUSD_PER_CREDIT');
  if (ownedCredit === null || mirroredCredit === null) {
    problems.push('MICROUSD_PER_CREDIT: the credit value could not be read on both sides');
  } else if (ownedCredit !== mirroredCredit) {
    problems.push(
      `MICROUSD_PER_CREDIT: the CLI prices a credit at ${mirroredCredit} microUSD, the contract at ${ownedCredit}`,
    );
  }

  const ownedStatuses = tsConstStrings(
    read(SUBSCRIPTION_ENTITLEMENT) ?? '',
    'ENTITLED_SUBSCRIPTION_STATUSES',
  );
  const mirroredStatuses = rustConstStrings(usageSummary, 'ENTITLED_SUBSCRIPTION_STATUSES');
  if (ownedStatuses === null || mirroredStatuses === null) {
    problems.push('ENTITLED_SUBSCRIPTION_STATUSES: the list could not be read on both sides');
  } else if (
    ownedStatuses.length !== mirroredStatuses.length ||
    !ownedStatuses.every((status) => mirroredStatuses.includes(status))
  ) {
    problems.push(
      `ENTITLED_SUBSCRIPTION_STATUSES: the CLI lists ${mirroredStatuses.join(', ')}, the contract ${ownedStatuses.join(', ')}`,
    );
  }

  const ownedCodes = tsUsageLimitCodes(read(BILLING_CATALOG) ?? '');
  const mirroredCodes = rustConstStrings(read(LLM_ERROR) ?? '', 'MANAGED_USAGE_LIMIT_CODES');
  if (ownedCodes === null || mirroredCodes === null) {
    problems.push('MANAGED_USAGE_LIMIT_CODES: the quota codes could not be read on both sides');
  } else {
    for (const code of ownedCodes.filter((code) => !mirroredCodes.includes(code))) {
      problems.push(
        `MANAGED_USAGE_LIMIT_CODES: ${code} is a plan limit the engine reports as rate limiting`,
      );
    }
    for (const code of mirroredCodes.filter((code) => !ownedCodes.includes(code))) {
      problems.push(`MANAGED_USAGE_LIMIT_CODES: ${code} is no longer a managed quota code`);
    }
  }

  const billingCatalog = read(BILLING_CATALOG) ?? '';
  const cliPlans = read(CLI_PLANS) ?? '';
  const ownedWorkloads = tsStringMap(billingCatalog, 'USAGE_WORKLOAD_LABELS');
  problems.push(
    ...compareMaps(
      'Capability labels',
      tsStringMap(billingCatalog, 'BILLING_PLAN_CAPABILITY_LABELS'),
      rustStringPairs(cliPlans, 'PLAN_CAPABILITY_LABELS'),
    ),
    ...compareMaps(
      'Capability tiers',
      tsCapabilityTiers(billingCatalog),
      rustCapabilityTiers(cliPlans),
      (tiers) => [...tiers].sort().join(','),
    ),
    ...compareMaps(
      'Plan window credits',
      tsPlanWindowCredits(read(MANAGED_USAGE_LIMITS_OWNER) ?? ''),
      rustPlanWindowCredits(cliPlans),
    ),
    ...compareMaps(
      'Workload labels (CLI)',
      ownedWorkloads,
      rustStringPairs(usageSummary, 'USAGE_WORKLOAD_LABELS'),
    ),
    ...compareMaps(
      'Workload labels (web)',
      ownedWorkloads,
      tsStringMap(read(WEB_USAGE_ATTRIBUTION) ?? '', 'WORKLOAD_LABELS'),
    ),
  );
  const ownedSeats = tsPerSeatPlans(billingCatalog);
  const mirroredSeats = rustConstStrings(cliPlans, 'PER_SEAT_PLANS');
  if (ownedSeats === null || mirroredSeats === null) {
    problems.push('Per-seat plans: the list could not be read on both sides');
  } else if (ownedSeats.sort().join(',') !== [...mirroredSeats].sort().join(',')) {
    problems.push(
      `Per-seat plans: the CLI lists ${mirroredSeats.join(', ')}, the catalog ${ownedSeats.join(', ')}`,
    );
  }

  const ownedLabels = tsPlanLabels(read(BILLING_CATALOG) ?? '');
  const mirroredLabels = rustTierLabels(read(CLI_TIER_CACHE) ?? '');
  if (ownedLabels === null || mirroredLabels === null) {
    problems.push('Plan labels: the catalog or the CLI tier labels could not be read');
  } else {
    for (const [tier, label] of mirroredLabels) {
      if (CLI_LOCAL_MODE_TIERS.has(tier)) continue;
      const owned = ownedLabels.get(tier);
      if (owned === undefined) {
        problems.push(`Plan labels: the CLI labels ${tier}, which the catalog does not sell`);
      } else if (owned !== label) {
        problems.push(`Plan labels: the CLI calls ${tier} "${label}", the catalog "${owned}"`);
      }
    }
  }

  return { problems, checked: CLI_USAGE_MIRRORS.length };
}

function main() {
  const { problems, checked } = checkProtocolTypes();
  const cli = checkCliUsageMirror();
  if (problems.length > 0 || cli.problems.length > 0) {
    console.error('Protocol types have diverged across languages:');
    for (const problem of [...problems, ...cli.problems]) console.error(`- ${problem}`);
    console.error('\nRegenerate with `pnpm generate:protocol-types`, then reconcile the mirrors.');
    return 1;
  }
  console.log(
    `Protocol type parity check passed (${checked} generated modules, crate mirror, ` +
      `app-server capabilities, tool vocabularies, ${cli.checked} CLI usage mirrors).`,
  );
  return 0;
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) process.exitCode = main();
