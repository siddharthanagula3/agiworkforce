/**
 * Account-level controls: authentication strength, network origin, data
 * retention, secret handling. Each must bind against the caller's memberships,
 * never against the workspace the request selected.
 *
 * `evaluateActiveWorkspacePolicy` is deliberately absent. It governs content
 * scope, where the selected workspace IS the subject, and it already falls back
 * to the funding organization for the decisions that must not be selectable.
 */
const ACCOUNT_LEVEL_RESOLVERS = [
  'resolveMfaPolicy',
  'resolveIpAllowListPolicy',
  'resolveZeroDataRetentionPolicy',
  'resolveSecretHandlingPolicy',
];

const SCOPE_FROM_REQUEST = 'resolveActiveOrganizationId';

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

function declarationOf(source, resolver) {
  const match = new RegExp(`export async function ${resolver}\\s*\\(([\\s\\S]*?)\\)\\s*:`).exec(
    source,
  );
  if (!match) return null;

  const bodyStart = source.indexOf('{', match.index + match[0].length);
  if (bodyStart === -1) return null;

  const nextExport = source.indexOf('\nexport ', bodyStart);
  return {
    index: match.index,
    parameters: match[1],
    body: source.slice(bodyStart, nextExport === -1 ? source.length : nextExport),
    bodyStart,
  };
}

export function findRequestScopedPolicyResolvers(source) {
  const hits = [];

  for (const resolver of ACCOUNT_LEVEL_RESOLVERS) {
    const declaration = declarationOf(source, resolver);
    if (!declaration) continue;

    if (/\brequest\b/.test(declaration.parameters)) {
      hits.push({
        line: lineOf(source, declaration.index),
        detail: `${resolver} accepts a request parameter`,
      });
    }

    const scopeCall = declaration.body.indexOf(SCOPE_FROM_REQUEST);
    if (scopeCall !== -1) {
      hits.push({
        line: lineOf(source, declaration.bodyStart + scopeCall),
        detail: `${resolver} resolves its scope with ${SCOPE_FROM_REQUEST}`,
      });
    }
  }

  return hits;
}
