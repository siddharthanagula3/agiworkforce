const BLOCK_COMMENT_RE = /\/\*[\s\S]*?\*\//g;

export const CANONICAL_MODULE = 'packages/contracts/types/src/errors.ts';

/**
 * A second spelling of a code the canonical module already has. Two names for
 * one condition is the vocabulary contradiction a terminology grep misses,
 * because both sides look like ordinary error codes.
 */
const SYNONYMS = {
  RATE_LIMIT: 'RATE_LIMIT_EXCEEDED',
  RATELIMIT: 'RATE_LIMIT_EXCEEDED',
  RATE_LIMITED: 'RATE_LIMIT_EXCEEDED',
  TOO_MANY_REQUESTS: 'RATE_LIMIT_EXCEEDED',
  SERVER_ERROR: 'INTERNAL_ERROR',
  INTERNAL_SERVER_ERROR: 'INTERNAL_ERROR',
  UNKNOWN: 'INTERNAL_ERROR',
  UNKNOWN_ERROR: 'INTERNAL_ERROR',
  BAD_REQUEST: 'VALIDATION_ERROR',
  INVALID_REQUEST: 'INVALID_INPUT',
  AUTH_ERROR: 'UNAUTHORIZED',
  UNAUTHENTICATED: 'UNAUTHORIZED',
  ACCESS_DENIED: 'FORBIDDEN',
  PERMISSION_DENIED: 'FORBIDDEN',
  TIMED_OUT: 'TIMEOUT',
  DEADLINE_EXCEEDED: 'TIMEOUT',
  UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  PAYLOAD_TOO_LARGE_ERROR: 'PAYLOAD_TOO_LARGE',
  TOO_LARGE: 'PAYLOAD_TOO_LARGE',
};

const REGISTRY_DECLARATION_RE =
  /(?:export\s+)?(?:const|enum)\s+([A-Za-z_$][\w$]*)\s*(?:=\s*\{|\{)/g;

const MIRRORED_MEMBER_RE = /\b([A-Z][A-Z0-9_]{2,})\s*[:=]\s*['"]\1['"]/g;

export function stripComments(source) {
  return source
    .replace(BLOCK_COMMENT_RE, (block) => block.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((line) => (/^\s*(?:\/\/|\*)/.test(line) ? '' : line.replace(/(^|[^:"'`])\/\/.*$/, '$1')))
    .join('\n');
}

function blockAt(code, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < code.length; i += 1) {
    if (code[i] === '{') depth += 1;
    else if (code[i] === '}') {
      depth -= 1;
      if (depth === 0) return code.slice(openIndex, i + 1);
    }
  }
  return code.slice(openIndex);
}

export function parseCanonicalCodes(canonicalSource) {
  const code = stripComments(canonicalSource);
  const members = new Set();
  MIRRORED_MEMBER_RE.lastIndex = 0;
  let match;
  while ((match = MIRRORED_MEMBER_RE.exec(code)) !== null) members.add(match[1]);
  return members;
}

export function findErrorRegistries(source, file) {
  const code = stripComments(source);
  const registries = [];
  REGISTRY_DECLARATION_RE.lastIndex = 0;
  let declaration;
  while ((declaration = REGISTRY_DECLARATION_RE.exec(code)) !== null) {
    const openIndex = code.indexOf('{', declaration.index + declaration[0].length - 1);
    if (openIndex < 0) continue;
    const body = blockAt(code, openIndex);
    const members = [];
    MIRRORED_MEMBER_RE.lastIndex = 0;
    let member;
    while ((member = MIRRORED_MEMBER_RE.exec(body)) !== null) members.push(member[1]);
    if (members.length < 3) continue;
    registries.push({
      file,
      name: declaration[1],
      line: code.slice(0, declaration.index).split('\n').length,
      members,
    });
  }
  return registries;
}

export function auditRegistries(registries, canonicalCodes) {
  const errors = [];
  for (const registry of registries) {
    if (registry.file === CANONICAL_MODULE) continue;
    const overlap = registry.members.filter((member) => canonicalCodes.has(member));
    const contradictions = registry.members
      .filter((member) => SYNONYMS[member] && canonicalCodes.has(SYNONYMS[member]))
      .map((member) => `${member} (canonical: ${SYNONYMS[member]})`);

    if (contradictions.length > 0) {
      errors.push(
        `${registry.file}:${registry.line} ${registry.name} spells ${contradictions.join(', ')}. ` +
          `One condition, two names, is how two surfaces disagree about the same failure. Import ` +
          `ErrorCode from ${CANONICAL_MODULE} instead.`,
      );
      continue;
    }
    if (overlap.length >= 3) {
      errors.push(
        `${registry.file}:${registry.line} ${registry.name} redeclares ${overlap.length} codes the ` +
          `canonical registry already owns (${overlap.slice(0, 4).join(', ')}). Import ErrorCode ` +
          `from ${CANONICAL_MODULE} and add the missing member there rather than forking it.`,
      );
    }
  }
  return errors;
}

export { SYNONYMS };
