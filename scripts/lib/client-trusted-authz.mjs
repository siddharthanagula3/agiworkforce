/**
 * The nine things a request may not decide about itself, and the reading that
 * tells a decision from a field a route merely carries.
 *
 * `fields` name the concept unambiguously: nothing sends `isAdmin` for any
 * other purpose. `ambiguousFields` are words the product uses for two
 * different things, `role` on a chat message and `role` in a workspace, so
 * they only count when the same line compares against a value that would
 * grant something.
 */
export const CONCEPTS = [
  {
    id: 'role',
    question: 'which role the caller holds in the workspace',
    fields: ['organizationRole', 'memberRole', 'orgRole', 'workspaceRole'],
    ambiguousFields: ['role'],
    privilegedValues: ['owner', 'admin', 'editor', 'commenter', 'viewer', 'member'],
    vocabularySource: {
      file: 'packages/contracts/types/src/resource-lifecycle.ts',
      constant: 'RESOURCE_ROLES',
    },
    resolver: 'apps/web/lib/resources/resource-acl.ts',
  },
  {
    id: 'plan',
    question: 'which plan the account is on',
    fields: ['planTier', 'subscriptionTier', 'billingPlan', 'currentPlan'],
    ambiguousFields: ['plan', 'tier'],
    privilegedValues: [
      'local-only',
      'byok',
      'free',
      'basic',
      'pro',
      'max',
      'max_15x',
      'team',
      'enterprise',
    ],
    vocabularySource: {
      file: 'packages/contracts/types/src/billing-catalog.ts',
      constant: 'SELF_SERVE_PAID_PLAN_TIERS',
    },
    resolver: 'apps/web/lib/services/effective-subscription-service.ts',
  },
  {
    id: 'credit-balance',
    question: 'how many credits are left',
    fields: ['creditBalance', 'creditsRemaining', 'remainingCredits', 'availableCredits'],
    ambiguousFields: [],
    resolver: 'apps/web/lib/services/entitlement-resolution.ts',
  },
  {
    id: 'tool-permission',
    question: 'which tools the caller may run',
    fields: ['toolPermission', 'toolPermissions', 'allowedTools', 'grantedTools'],
    ambiguousFields: [],
    resolver: 'packages/contracts/types/src/capability-handshake/types.ts',
  },
  {
    id: 'workspace-ownership',
    question: 'who owns the workspace or the row',
    fields: ['ownerUserId', 'isOwner', 'ownedBy'],
    ambiguousFields: [],
    resolver: 'apps/web/lib/resources/resource-acl.ts',
  },
  {
    id: 'file-acl',
    question: 'what the caller may do with a file',
    fields: ['acl', 'canEdit', 'canWrite', 'canDelete', 'grantedRole'],
    ambiguousFields: ['visibility'],
    privilegedValues: ['private', 'organization', 'public'],
    vocabularySource: {
      file: 'packages/contracts/types/src/resource-lifecycle.ts',
      constant: 'RESOURCE_VISIBILITIES',
    },
    resolver: 'packages/contracts/types/src/resource-lifecycle.ts',
  },
  {
    id: 'model-access',
    question: 'whether the caller may reach a model',
    fields: ['hasAccess', 'modelAccess', 'isEntitled', 'entitlement'],
    ambiguousFields: [],
    resolver: 'apps/web/lib/services/entitlement-resolution.ts',
  },
  {
    id: 'admin-status',
    question: 'whether the caller is an administrator',
    fields: ['isAdmin', 'isPlatformAdmin', 'isSuperAdmin', 'adminOverride'],
    ambiguousFields: [],
    resolver: 'apps/web/lib/auth-guards.ts',
  },
  {
    id: 'trust-mode',
    question: 'which trust boundary the call runs inside',
    fields: ['trustMode', 'privacyMode', 'trustBoundary'],
    ambiguousFields: [],
    resolver: 'packages/contracts/types/src/trust-mode-contract.ts',
  },
];

/** Reading the client controls. */
const REQUEST_BINDING =
  /(?:const|let)\s+(?:(\{[^}]*\})|([A-Za-z_$][\w$]*))\s*(?::[^=]+?)?=\s*(?:await\s+)?[^;\n]*?(?:req(?:uest)?\.(?:json|formData|text)\(\)|searchParams\.get\(|headers\.get\()/g;

const REBIND = /(?:const|let)\s+(\{[^}]*\}|[A-Za-z_$][\w$]*)\s*(?::[^=]+?)?=\s*([^;\n]+)/g;

/** A read that only reaches a branch is a read the request steered. */
const DECISION = /if\s*\(|\?\.?\s|&&|\|\||===|!==|\breturn\s+!?|\bthrow\b/;

function namesIn(pattern) {
  const names = [];
  for (const part of pattern.slice(1, -1).split(',')) {
    const bound = part.includes(':') ? part.slice(part.indexOf(':') + 1) : part;
    const clean = bound.replace(/[^\w$]/g, '').trim();
    if (clean) names.push(clean);
  }
  return names;
}

export function requestBoundNames(source) {
  const tainted = new Set();
  for (const match of source.matchAll(REQUEST_BINDING)) {
    if (match[1]) for (const name of namesIn(match[1])) tainted.add(name);
    else if (match[2]) tainted.add(match[2]);
  }
  // A parsed, renamed or defaulted copy of client input is still client input.
  for (let pass = 0; pass < 4; pass += 1) {
    const before = tainted.size;
    for (const match of source.matchAll(REBIND)) {
      const carries = [...match[2].matchAll(/[A-Za-z_$][\w$]*/g)].some((name) =>
        tainted.has(name[0]),
      );
      if (!carries) continue;
      if (match[1].startsWith('{')) for (const name of namesIn(match[1])) tainted.add(name);
      else tainted.add(match[1]);
    }
    if (tainted.size === before) break;
  }
  return tainted;
}

/** The values in a declared vocabulary, so a new one cannot escape the guard. */
export function parseVocabulary(source, constant) {
  const start = source.indexOf(`${constant} =`);
  if (start < 0) return null;
  const open = source.indexOf('[', start);
  const close = source.indexOf(']', open);
  if (open < 0 || close < 0) return null;
  return [...source.slice(open, close).matchAll(/'([\w-]+)'/g)].map((match) => match[1]);
}

export function findTrustedClientReads(source, concepts = CONCEPTS) {
  const tainted = requestBoundNames(source);
  if (tainted.size === 0) return [];
  const members = [...tainted];
  const findings = [];
  const lines = source.split('\n');

  const reads = (line, field) => {
    if (tainted.has(field) && new RegExp(`\\b${field}\\b`).test(line)) return true;
    return members.some((name) => new RegExp(`\\b${name}(?:\\.[\\w$]+)*\\.${field}\\b`).test(line));
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*(?:\/\/|\*)/.test(line)) continue;
    if (!DECISION.test(line)) continue;
    for (const concept of concepts) {
      const hit =
        concept.fields.find((field) => reads(line, field)) ??
        (concept.ambiguousFields ?? []).find(
          (field) =>
            reads(line, field) &&
            (concept.privilegedValues ?? []).some((value) =>
              new RegExp(`['"\`]${value}['"\`]`).test(line),
            ),
        );
      if (!hit) continue;
      findings.push({ concept: concept.id, field: hit, line: index + 1, text: line.trim() });
    }
  }
  return findings;
}
