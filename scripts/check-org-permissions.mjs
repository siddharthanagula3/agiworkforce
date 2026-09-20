#!/usr/bin/env node
/**
 * Every organization-scoped mutating route decides server side, by asking for a
 * permission the contract names.
 *
 * The permission grid is only worth what the routes ask of it, so this
 * enumerates the route tree rather than a hand-written list: every POST, PUT,
 * PATCH and DELETE under the two workspace consoles, each handler resolved
 * through its own identifier graph to a call that consults
 * organization_member_permissions. A handler that reaches none of them is
 * deciding by something other than the grid, or by nothing at all. Terminals
 * are keyed by owning module, so a same-named local helper never counts. The
 * self-service routes act on the caller's own membership and are declared with
 * their reason, as is every place a Primary Owner is read off the membership
 * row, which is where the contract says that one fact lives.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

import { createResolver, stripComments } from './lib/module-graph.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

const WEB = path.join(scanRoot, 'apps/web');
const PERMISSIONS_CONTRACT = path.join(
  scanRoot,
  'packages/contracts/types/src/enterprise/permissions.ts',
);

const CONSOLE_ROOTS = ['app/api/settings/organization', 'app/api/settings/team'];
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const PERMISSION_SERVICE = 'apps/web/lib/services/organization-permission-service.ts';

/** Refuses on its own, so reaching one is the whole decision. */
export const ASSERTING_TERMINALS = [
  [PERMISSION_SERVICE, 'requireMemberPermission'],
  [PERMISSION_SERVICE, 'requireOrganizationPermission'],
  [PERMISSION_SERVICE, 'requirePermission'],
  [
    'apps/web/app/api/settings/organization/workspace-access.ts',
    'requireWorkspaceConsolePermission',
  ],
  ['apps/web/lib/services/org-sharing-service.ts', 'requireSharingManager'],
  ['apps/web/lib/services/organization-membership-service.ts', 'requireOrganizationOwner'],
  ['apps/web/lib/services/organization-delegation.ts', 'assertDelegatedScope'],
  ['apps/web/lib/server/service-principals/caller.ts', 'resolveServicePrincipalCaller'],
];

/** Hands back the grid's answer; the handler still has to act on it. */
export const RESOLVING_TERMINALS = [
  [PERMISSION_SERVICE, 'resolveOrganizationPermissions'],
  [PERMISSION_SERVICE, 'resolveOrganizationAccess'],
  [PERMISSION_SERVICE, 'resolveActiveOrganizationAccess'],
  ['apps/web/app/api/settings/organization/workspace-access.ts', 'resolveWorkspaceConsoleAccess'],
  ['apps/web/lib/resources/resource-acl.ts', 'canPerformOnOrganization'],
];

/** How a handler acts on a resolved permission set. */
const DECIDES_ON_SET =
  /\.has\(\s*'[a-z][a-z.]*\.[a-z]+'\s*\)|\bmissingOrganizationPermissions\s*\(|\bhasOrganizationPermission\s*\(|\bcanPerformOnOrganization\s*\(/;

/**
 * Routes whose write is gated by a per-command row policy rather than by a
 * call. The named table must carry a policy that asks the grid, and the route
 * must take the row-level-security connection, or the entry is a fiction.
 */
export const RLS_ENFORCED_ROUTES = new Map([
  [
    'app/api/settings/organization/shared/artifacts/[artifactId]/route.ts',
    'organization_shared_artifacts',
  ],
  [
    'app/api/settings/organization/shared/conversations/[sharedSessionId]/route.ts',
    'organization_shared_sessions',
  ],
]);

const MIGRATIONS = path.join(WEB, 'db/neon');
const PERMISSION_SQL_HELPERS = [
  'app_has_org_permission',
  'app_org_resource_is_manageable',
  'app_row_is_visible',
];

/** Routes that act on the caller's own membership, so no grant applies. */
export const SELF_SERVICE_ROUTES = new Map([
  [
    'app/api/settings/organization/active/route.ts',
    'the workspace switch writes the caller’s own selection and proves membership first',
  ],
  [
    'app/api/settings/organization/leave/route.ts',
    'leaving removes the caller’s own membership and nobody else’s',
  ],
  [
    'app/api/settings/team/invitations/accept/route.ts',
    'accepting is bound to the invited address and confers only the invited role',
  ],
]);

/**
 * The Primary Owner is answered by the membership row rather than by a grant,
 * so these comparisons are the contract, not a shortcut around it. The set may
 * only shrink: an entry whose file no longer compares is an error.
 */
export const PRIMARY_OWNER_ROLE_READS = new Map([
  [
    'apps/web/lib/services/organization-permission-service.ts',
    'builds the AuthorizationSubject the decision function reads',
  ],
  [
    'apps/web/lib/services/organization-membership-service.ts',
    'the one gate for the lifecycle acts only the Primary Owner may perform',
  ],
  [
    'apps/web/app/api/settings/team/[memberId]/route.ts',
    'the owner invariant asks whether the target is the owner, not whether the actor may act',
  ],
  [
    'apps/web/lib/services/workspace-posture-service.ts',
    'counts how many owners a workspace has, and decides nothing',
  ],
]);

const ROLE_COMPARISON = /\brole\s*(?:===|!==)\s*'(?:owner|admin|member|viewer)'/;
const PERMISSION_LITERAL = /'([a-z][a-z]*(?:\.[a-z]+)+)'/g;

const resolveSpecifier = createResolver({ '@/*': WEB });

function relative(file) {
  return path.relative(scanRoot, file).replace(/\\/gu, '/');
}

function readPermissionRegistry() {
  const source = fs.readFileSync(PERMISSIONS_CONTRACT, 'utf8');
  const areas = /export const ADMIN_PERMISSION_AREAS = \[([\s\S]*?)\] as const;/.exec(source);
  const features = /export const FEATURE_ORGANIZATION_PERMISSIONS = \[([\s\S]*?)\] as const;/.exec(
    source,
  );
  const aliases =
    /export const LEGACY_ORGANIZATION_PERMISSION_ALIASES[\s\S]*?Object\.freeze\(\{([\s\S]*?)\n\}\);/.exec(
      source,
    );
  if (!areas || !features || !aliases) {
    throw new Error(
      'check:org-permissions cannot read the permission registry; its shape in ' +
        'enterprise/permissions.ts changed and this reader has to follow it.',
    );
  }
  const registry = new Set();
  for (const [, key] of features[1].matchAll(/'([^']+)'/g)) registry.add(key);
  for (const [, area] of areas[1].matchAll(/'([^']+)'/g)) {
    registry.add(`admin.${area}.view`);
    registry.add(`admin.${area}.manage`);
  }
  for (const [, legacy] of aliases[1].matchAll(/'([^']+)':/g)) registry.add(legacy);
  return registry;
}

const modules = new Map();

function referencedIdentifiers(node) {
  const names = new Set();
  const visit = (child) => {
    if (ts.isIdentifier(child)) names.add(child.text);
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return names;
}

function analyzeModule(file) {
  const cached = modules.get(file);
  if (cached) return cached;
  const tree = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const module = { file, imports: new Map(), symbols: new Map(), starExports: [] };
  modules.set(file, module);

  for (const statement of tree.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const clause = statement.importClause;
      if (!clause || clause.isTypeOnly) continue;
      const specifier = statement.moduleSpecifier.text;
      const target = resolveSpecifier(specifier, file);
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          if (element.isTypeOnly) continue;
          module.imports.set(element.name.text, {
            target,
            imported: (element.propertyName ?? element.name).text,
          });
        }
      }
      continue;
    }
    if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) {
      const specifier =
        statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
          ? statement.moduleSpecifier.text
          : null;
      const target = specifier ? resolveSpecifier(specifier, file) : null;
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          if (element.isTypeOnly || !target) continue;
          module.imports.set(element.name.text, {
            target,
            imported: (element.propertyName ?? element.name).text,
          });
        }
      } else if (target) {
        module.starExports.push(target);
      }
      continue;
    }
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      module.symbols.set(statement.name.text, referencedIdentifiers(statement));
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        const names = declaration.initializer
          ? referencedIdentifiers(declaration.initializer)
          : new Set();
        // forEachChild walks past a bare identifier, and `export const PUT = handle`
        // is exactly that edge.
        if (declaration.initializer && ts.isIdentifier(declaration.initializer)) {
          names.add(declaration.initializer.text);
        }
        module.symbols.set(declaration.name.text, names);
      }
    }
  }
  return module;
}

function terminalOf(file, symbol) {
  const owner = relative(file);
  for (const [module, name] of ASSERTING_TERMINALS) {
    if (owner === module && name === symbol) return 'asserting';
  }
  for (const [module, name] of RESOLVING_TERMINALS) {
    if (owner === module && name === symbol) return 'resolving';
  }
  return null;
}

const reachCache = new Map();

function reachFrom(file, symbol, stack) {
  const terminal = terminalOf(file, symbol);
  if (terminal) return new Set([terminal]);
  const key = `${file}::${symbol}`;
  if (reachCache.has(key)) return reachCache.get(key);
  if (stack.has(key)) return new Set();
  stack.add(key);

  const module = analyzeModule(file);
  const found = new Set();
  const imported = module.imports.get(symbol);
  if (imported?.target && imported.target.startsWith(WEB)) {
    for (const kind of reachFrom(imported.target, imported.imported, stack)) found.add(kind);
  } else if (module.symbols.has(symbol)) {
    for (const reference of module.symbols.get(symbol)) {
      if (reference === symbol) continue;
      if (!module.imports.has(reference) && !module.symbols.has(reference)) continue;
      for (const kind of reachFrom(file, reference, stack)) found.add(kind);
    }
  } else {
    for (const target of module.starExports) {
      if (!target.startsWith(WEB)) continue;
      for (const kind of reachFrom(target, symbol, stack)) found.add(kind);
    }
  }

  stack.delete(key);
  reachCache.set(key, found);
  return found;
}

function listRouteFiles(directory, files = []) {
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__') listRouteFiles(full, files);
    } else if (entry.name === 'route.ts') {
      files.push(full);
    }
  }
  return files;
}

function mutatingHandlers(source) {
  const pattern = /^export\s+(?:const|async function|function)\s+([A-Z]+)\b/gm;
  return [...source.matchAll(pattern)]
    .map((match) => match[1])
    .filter((name) => MUTATING_METHODS.has(name));
}

function permissionsAsked(source) {
  const asked = new Set();
  PERMISSION_LITERAL.lastIndex = 0;
  for (const [, literal] of source.matchAll(PERMISSION_LITERAL)) asked.add(literal);
  return asked;
}

/**
 * True when some migration defines a write policy on the table whose body asks
 * the permission grid. Read from the SQL, so deleting the policy fails here.
 */
function tableHasPermissionWritePolicy(table) {
  let names;
  try {
    names = fs.readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql'));
  } catch {
    return false;
  }
  const policy = new RegExp(
    `create policy[\\s\\S]{0,200}?on public\\.${table} for (?:delete|update|insert|all)[\\s\\S]*?;`,
    'gi',
  );
  for (const name of names.sort()) {
    const source = stripComments(fs.readFileSync(path.join(MIGRATIONS, name), 'utf8'));
    for (const match of source.matchAll(policy)) {
      if (PERMISSION_SQL_HELPERS.some((helper) => match[0].includes(helper))) return true;
    }
  }
  return false;
}

function main() {
  const registry = readPermissionRegistry();
  const unpoliced = [];
  const seenRlsEnforced = new Set();
  const uncovered = [];
  const unacted = [];
  const unknownPermissions = new Map();
  const seenSelfService = new Set();
  let mutatingRoutes = 0;

  for (const root of CONSOLE_ROOTS) {
    for (const file of listRouteFiles(path.join(WEB, root)).sort()) {
      const routeRelative = path.relative(WEB, file).replace(/\\/gu, '/');
      const source = stripComments(fs.readFileSync(file, 'utf8'));
      const handlers = mutatingHandlers(source);
      if (handlers.length === 0) continue;

      if (SELF_SERVICE_ROUTES.has(routeRelative)) {
        seenSelfService.add(routeRelative);
        continue;
      }

      mutatingRoutes += 1;

      const table = RLS_ENFORCED_ROUTES.get(routeRelative);
      if (table) {
        seenRlsEnforced.add(routeRelative);
        if (!/\bgetUserScopedDb\s*\(/.test(source)) {
          unpoliced.push(`${routeRelative}: writes on a connection row policies do not govern`);
        } else if (!tableHasPermissionWritePolicy(table)) {
          unpoliced.push(`${routeRelative}: ${table} has no write policy that asks the grid`);
        }
        continue;
      }

      const kinds = new Set();
      for (const handler of handlers) {
        for (const kind of reachFrom(file, handler, new Set())) kinds.add(kind);
      }
      if (kinds.size === 0) {
        uncovered.push(`${routeRelative} [${handlers.join(', ')}]`);
        continue;
      }
      if (!kinds.has('asserting') && !DECIDES_ON_SET.test(source)) {
        unacted.push(`${routeRelative} [${handlers.join(', ')}]`);
        continue;
      }

      for (const asked of permissionsAsked(source)) {
        if (registry.has(asked)) continue;
        if (!/^(feature|admin)\./.test(asked)) continue;
        const where = unknownPermissions.get(asked) ?? new Set();
        where.add(routeRelative);
        unknownPermissions.set(asked, where);
      }
    }
  }

  const staleDeclarations = [
    ...[...SELF_SERVICE_ROUTES.keys()].filter((entry) => !seenSelfService.has(entry)),
    ...[...RLS_ENFORCED_ROUTES.keys()].filter((entry) => !seenRlsEnforced.has(entry)),
  ];

  const undeclaredRoleReads = [];
  const seenRoleReads = new Set();
  const roleReadRoots = [
    ...CONSOLE_ROOTS.map((root) => path.join(WEB, root)),
    path.join(WEB, 'lib/services'),
  ];
  for (const directory of roleReadRoots) {
    const walk = (dir) => {
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__') walk(full);
          continue;
        }
        if (!entry.name.endsWith('.ts') || entry.name.includes('.test.')) continue;
        if (!ROLE_COMPARISON.test(stripComments(fs.readFileSync(full, 'utf8')))) continue;
        const fileRelative = relative(full);
        if (PRIMARY_OWNER_ROLE_READS.has(fileRelative)) seenRoleReads.add(fileRelative);
        else undeclaredRoleReads.push(fileRelative);
      }
    };
    walk(directory);
  }
  const staleRoleReads = [...PRIMARY_OWNER_ROLE_READS.keys()].filter(
    (entry) => !seenRoleReads.has(entry),
  );

  const failures = [];
  if (uncovered.length > 0) {
    failures.push(
      `${uncovered.length} organization-scoped mutating route(s) reach no permission check.\n` +
        '  Ask the grid through the shared authorization service before the write.\n' +
        uncovered.map((entry) => `  ${entry}`).join('\n'),
    );
  }
  if (unacted.length > 0) {
    failures.push(
      `${unacted.length} route(s) resolve the caller's permissions and never act on them.\n` +
        '  Resolving is not deciding: assert, or test the set the resolver returned.\n' +
        unacted.map((entry) => `  ${entry}`).join('\n'),
    );
  }
  if (unpoliced.length > 0) {
    failures.push(
      `${unpoliced.length} route(s) declared as row-policy enforced are not.\n` +
        unpoliced.map((entry) => `  ${entry}`).join('\n'),
    );
  }
  if (staleDeclarations.length > 0) {
    failures.push(
      `${staleDeclarations.length} declared route(s) name no mutating route any more.\n` +
        staleDeclarations.map((entry) => `  ${entry}`).join('\n'),
    );
  }
  if (unknownPermissions.size > 0) {
    failures.push(
      `${unknownPermissions.size} permission id(s) asked for that the registry does not define.\n` +
        '  Every id comes from enterprise/permissions.ts, never a literal coined at a call site.\n' +
        [...unknownPermissions]
          .map(([key, where]) => `  ${key}  (${[...where].sort().join(', ')})`)
          .join('\n'),
    );
  }
  if (undeclaredRoleReads.length > 0) {
    failures.push(
      `${undeclaredRoleReads.length} file(s) decide by comparing a role name.\n` +
        '  A permission answers "may they"; a role name answers only "who are they".\n' +
        undeclaredRoleReads.map((entry) => `  ${entry}`).join('\n'),
    );
  }
  if (staleRoleReads.length > 0) {
    failures.push(
      `${staleRoleReads.length} PRIMARY_OWNER_ROLE_READS entr(y/ies) no longer compare a role.\n` +
        '  The set may only shrink; delete them.\n' +
        staleRoleReads.map((entry) => `  ${entry}`).join('\n'),
    );
  }

  if (failures.length > 0) {
    console.error(`check:org-permissions failed.\n\n${failures.join('\n\n')}\n`);
    process.exit(1);
  }

  console.log(
    `check:org-permissions, ${mutatingRoutes} organization-scoped mutating route(s) each ask the ` +
      `permission grid, ${seenSelfService.size} self-service route(s) declared, ${registry.size} ` +
      `permission ids in the registry, ${seenRlsEnforced.size} row-policy enforced, ` +
      `${seenRoleReads.size} declared Primary Owner role read(s).`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
