const BLOCK_COMMENT_RE = /\/\*[\s\S]*?\*\//g;

/**
 * Surfaces where a change ships to a fraction of production before all of it.
 * Each one must consult the flag module, so the rollout has a control that can
 * be turned down without a deploy. Removing that import is the regression this
 * list exists to catch; adding a surface here is how a new risky capability
 * declares itself.
 *
 * Every entry must be a committed file. Naming one that only exists in someone's
 * working tree makes this guard fail on a clean checkout, which is how the list
 * lost its prompt entry: prompt version rollout belongs here, and the entry goes
 * back the moment the prompt flag registry lands on main.
 */
const RISKY_SURFACES = [
  {
    file: 'apps/web/lib/services/model-rollout/rollout-routing-inputs.ts',
    why: 'model rollout decides which slot a request reaches',
  },
  {
    file: 'apps/web/lib/feature-flags/routing-flags.ts',
    why: 'routing canary and shadow stages',
  },
  {
    file: 'apps/web/app/api/me/route.ts',
    why: 'the only route that hands evaluated flags to a client',
  },
];

const FLAG_MODULE_RE =
  /['"][^'"]*(?:feature-flags|evaluate-flags|flag-definition|flag-store|flag-evaluation-service)(?:\/[^'"]*)?['"]|\bevaluateFlags?(?:ForSubject)?\s*\(|\bFlagEvaluation\b/;

/** Registries that name the flag keys production is allowed to read. */
const REGISTRY_FILES = ['apps/web/lib/feature-flags/routing-flags.ts'];

// Only the families whose registry is committed. Policing a `prompt.` literal
// while no committed file is allowed to spell one would fail the lane that
// lands the prompt registry, for a rule it could not have read.
const FLAG_KEY_LITERAL_RE = /['"](routing\.[a-z0-9_]+(?:[.:-][a-z0-9_]+)*)['"]/g;

export function stripComments(source) {
  return source
    .replace(BLOCK_COMMENT_RE, (block) => block.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((line) => (/^\s*(?:\/\/|\*)/.test(line) ? '' : line.replace(/(^|[^:"'`])\/\/.*$/, '$1')))
    .join('\n');
}

export function referencesFlagModule(source) {
  return FLAG_MODULE_RE.test(stripComments(source));
}

export function findUndeclaredFlagKeys(source, file) {
  if (REGISTRY_FILES.includes(file)) return [];
  const code = stripComments(source);
  const findings = [];
  FLAG_KEY_LITERAL_RE.lastIndex = 0;
  let match;
  while ((match = FLAG_KEY_LITERAL_RE.exec(code)) !== null) {
    findings.push({
      file,
      line: code.slice(0, match.index).split('\n').length,
      rule: 'undeclared-flag-key',
      detail: match[1],
    });
  }
  return findings;
}

export function checkRiskySurfaces(readFile) {
  const errors = [];
  for (const surface of RISKY_SURFACES) {
    const source = readFile(surface.file);
    if (source === null) {
      errors.push(
        `${surface.file} is named a risky rollout surface (${surface.why}) but no longer exists: ` +
          'move the entry to wherever that capability now lives, or delete it with the capability',
      );
      continue;
    }
    if (!referencesFlagModule(source)) {
      errors.push(
        `${surface.file} no longer consults the flag module, so ${surface.why} would ship to all ` +
          'of production at once with no control to turn it down',
      );
    }
  }
  return errors;
}

export { FLAG_KEY_LITERAL_RE, REGISTRY_FILES, RISKY_SURFACES };
