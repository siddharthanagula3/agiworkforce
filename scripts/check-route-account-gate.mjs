#!/usr/bin/env node
/**
 * Every API route that authenticates a user reaches the account and tenant gate.
 *
 * `assertAccountActive` is what turns away a suspended, erased or
 * password-reset-required account and a workspace locked down during an
 * incident. A route that authenticates a user some other way keeps serving all
 * of them, so the question is not "does the gate work" but "does every route
 * reach it". This resolves each exported handler's authentication through the
 * import graph and classifies the route; the routes that authenticate nobody
 * and the ones that authenticate a machine are declared, with a reason each, in
 * the contract this reads, and an entry that stops being true fails as stale.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;
const explain = process.argv.includes('--explain');

const WEB = path.join(scanRoot, 'apps/web');
const ROUTE_DIR = path.join(WEB, 'app/api');
const CONTRACT = path.join(scanRoot, 'packages/contracts/types/src/route-authentication.json');

const GATE_MODULE = path.join(WEB, 'lib/api-auth.ts');
const GATE_SYMBOL = 'assertAccountActive';

const HANDLERS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

/**
 * Identifiers whose presence in a handler's reachable graph means a human
 * principal has been established. Keyed by the module that owns them so a
 * same-named local helper elsewhere does not count.
 */
export const USER_PRINCIPALS = [
  ['@clerk/nextjs/server', 'auth'],
  ['@clerk/nextjs/server', 'currentUser'],
  ['@clerk/nextjs/server', 'getAuth'],
  ['apps/web/lib/server/identity.ts', 'getRequestIdentity'],
  ['apps/web/lib/server/identity-account.ts', 'resolveAuthenticatedAccount'],
  ['apps/web/lib/server/developer-token.ts', 'verifyDeveloperTokenSignature'],
  ['apps/web/lib/services/api-key-service.ts', 'ApiKeyService'],
];

/**
 * Modules that read the caller's identity to key or exempt something and never
 * hand a user id back to their caller, so reaching one is not authentication.
 * Nothing downstream of these can grant access, which is why the user kind
 * stops here instead of painting every rate-limited public route.
 */
export const IDENTIFICATION_ONLY = new Map([
  ['apps/web/lib/rate-limit.ts', 'resolves the subject only to key the limit bucket'],
  ['apps/web/lib/csrf.ts', 'resolves the subject to bind a token and to exempt bearer callers'],
]);

/**
 * Identifiers that establish a non-human principal: a signed webhook, the cron
 * secret, a SCIM bearer, an internal service token.
 */
export const MACHINE_PRINCIPALS = [
  ['apps/web/lib/server/cron-auth.ts', '*'],
  ['apps/web/lib/server/google-pubsub-push-identity.ts', '*'],
  ['apps/web/lib/triggers/trigger-signatures.ts', '*'],
  ['apps/web/lib/server/scim/scim-auth.ts', 'authenticateScimRequest'],
  ['apps/web/lib/github-app.ts', 'verifyGitHubWebhookSignature'],
  ['apps/web/lib/services/openrouter-video-webhook-service.ts', 'verifyOpenRouterVideoWebhook'],
  ['apps/web/lib/server/mobile-iap-store-verification.ts', 'verifyAppleStoreNotification'],
  ['apps/web/lib/e2b/provider-proxy-token.ts', 'verifyProviderProxyToken'],
  ['apps/web/app/api/stripe-webhook/lib/verify.ts', 'verifyStripeSignature'],
];

/** The declared classes a route may carry instead of reaching the gate. */
const DECLARED_CLASSES = ['public', 'machine', 'sessionLifecycle'];

function resolveModule(specifier, fromFile) {
  let base;
  if (specifier.startsWith('@/')) base = path.join(WEB, specifier.slice(2));
  else if (specifier.startsWith('.')) base = path.resolve(path.dirname(fromFile), specifier);
  else return null;
  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const modules = new Map();

function dynamicImportSpecifier(expression) {
  let node = expression;
  while (node && (ts.isAwaitExpression(node) || ts.isParenthesizedExpression(node))) {
    node = node.expression;
  }
  if (!node || !ts.isCallExpression(node)) return null;
  if (node.expression.kind !== ts.SyntaxKind.ImportKeyword) return null;
  const [argument] = node.arguments;
  return argument && ts.isStringLiteral(argument) ? { node, specifier: argument.text } : null;
}

/**
 * The identifiers a declaration mentions, plus its `await import()` edges.
 * A helper that defers the gate to a dynamic import is gated as surely as one
 * that imports it at the top, so both edges have to be followed.
 */
function declarationReferences(node) {
  const names = new Set();
  const dynamic = [];
  const consumed = new Set();

  const visit = (child) => {
    if (ts.isVariableDeclaration(child) && child.initializer) {
      const found = dynamicImportSpecifier(child.initializer);
      if (found && ts.isObjectBindingPattern(child.name)) {
        consumed.add(found.node);
        dynamic.push({
          specifier: found.specifier,
          names: child.name.elements
            .filter((element) => ts.isIdentifier(element.name))
            .map((element) => (element.propertyName ?? element.name).text),
        });
      }
    }
    if (ts.isPropertyAccessExpression(child)) {
      const found = dynamicImportSpecifier(child.expression);
      if (found) {
        consumed.add(found.node);
        dynamic.push({ specifier: found.specifier, names: [child.name.text] });
      }
      visit(child.expression);
      return;
    }
    if (
      ts.isCallExpression(child) &&
      child.expression.kind === ts.SyntaxKind.ImportKeyword &&
      !consumed.has(child)
    ) {
      const [argument] = child.arguments;
      if (argument && ts.isStringLiteral(argument)) {
        dynamic.push({ specifier: argument.text, names: null });
      }
    }
    if (ts.isIdentifier(child)) names.add(child.text);
    ts.forEachChild(child, visit);
  };

  ts.forEachChild(node, visit);
  return { names, dynamic };
}

export function analyzeModule(file) {
  const cached = modules.get(file);
  if (cached) return cached;
  const source = fs.readFileSync(file, 'utf8');
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const module = {
    file,
    imports: new Map(),
    symbols: new Map(),
    starExports: [],
    exportNames: new Set(),
  };
  modules.set(file, module);

  const declare = (name, refs, exported) => {
    module.symbols.set(name, refs);
    if (exported) module.exportNames.add(name);
  };

  for (const statement of tree.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      const specifier = statement.moduleSpecifier.text;
      const target = resolveModule(specifier, file);
      const clause = statement.importClause;
      if (!clause || clause.isTypeOnly) continue;
      if (clause.name) {
        module.imports.set(clause.name.text, { specifier, target, imported: 'default' });
      }
      if (clause.namedBindings) {
        if (ts.isNamespaceImport(clause.namedBindings)) {
          module.imports.set(clause.namedBindings.name.text, { specifier, target, imported: '*' });
        } else {
          for (const element of clause.namedBindings.elements) {
            if (element.isTypeOnly) continue;
            module.imports.set(element.name.text, {
              specifier,
              target,
              imported: (element.propertyName ?? element.name).text,
            });
          }
        }
      }
      continue;
    }

    if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly) continue;
      const specifier =
        statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
          ? statement.moduleSpecifier.text
          : null;
      const target = specifier ? resolveModule(specifier, file) : null;
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          if (element.isTypeOnly) continue;
          const original = (element.propertyName ?? element.name).text;
          module.exportNames.add(element.name.text);
          if (specifier)
            module.imports.set(element.name.text, { specifier, target, imported: original });
          else if (original !== element.name.text)
            module.symbols.set(element.name.text, { names: new Set([original]), dynamic: [] });
        }
      } else if (specifier) {
        module.starExports.push({ specifier, target });
      }
      continue;
    }

    const exported =
      ts.canHaveModifiers(statement) &&
      (ts.getModifiers(statement) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

    if (ts.isFunctionDeclaration(statement) && statement.name) {
      declare(statement.name.text, declarationReferences(statement), exported);
    } else if (ts.isClassDeclaration(statement) && statement.name) {
      declare(statement.name.text, declarationReferences(statement), exported);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        const refs = declaration.initializer
          ? declarationReferences(declaration.initializer)
          : { names: new Set(), dynamic: [] };
        if (declaration.initializer && ts.isIdentifier(declaration.initializer)) {
          refs.names.add(declaration.initializer.text);
        }
        declare(declaration.name.text, refs, exported);
      }
    }
  }
  return module;
}

function relative(file) {
  return path.relative(scanRoot, file).replace(/\\/gu, '/');
}

function terminalKind(specifier, target, imported) {
  const owner = target ? relative(target) : specifier;
  for (const [module, name] of USER_PRINCIPALS) {
    if (owner === module && (name === imported || name === '*')) return 'user';
  }
  for (const [module, name] of MACHINE_PRINCIPALS) {
    if (owner === module && (name === imported || name === '*')) return 'machine';
  }
  return null;
}

const reachCache = new Map();

/**
 * The principal kinds reachable from one symbol, and whether the gate is among
 * them. A result computed while a cycle was open is incomplete and is not
 * cached, so a mutually recursive pair cannot freeze a half-walked answer.
 */
function reachFrom(file, symbol, stack) {
  if (file === GATE_MODULE && symbol === GATE_SYMBOL) {
    return { gate: true, kinds: new Set(), complete: true };
  }
  const key = `${file}::${symbol}`;
  if (reachCache.has(key)) return reachCache.get(key);
  if (stack.has(key)) return { gate: false, kinds: new Set(), complete: false };
  stack.add(key);

  const module = analyzeModule(file);
  const identifiesOnly = IDENTIFICATION_ONLY.has(relative(file));
  const result = { gate: false, kinds: new Set(), complete: true };
  const merge = (other) => {
    if (other.gate) result.gate = true;
    if (!identifiesOnly) for (const kind of other.kinds) result.kinds.add(kind);
    if (!other.complete) result.complete = false;
  };
  const addKind = (kind) => {
    if (kind && !identifiesOnly) result.kinds.add(kind);
  };

  const imported = module.imports.get(symbol);
  if (imported) {
    addKind(terminalKind(imported.specifier, imported.target, imported.imported));
    if (imported.target) {
      merge(
        imported.imported === '*'
          ? reachModule(imported.target, stack)
          : reachFrom(imported.target, imported.imported, stack),
      );
    }
  } else if (module.symbols.has(symbol)) {
    const declaration = module.symbols.get(symbol);
    for (const reference of declaration.names) {
      if (reference === symbol) continue;
      if (module.imports.has(reference) || module.symbols.has(reference)) {
        merge(reachFrom(file, reference, stack));
      }
    }
    for (const edge of declaration.dynamic) {
      const target = resolveModule(edge.specifier, file);
      if (edge.names) {
        for (const name of edge.names) {
          addKind(terminalKind(edge.specifier, target, name));
          if (target) merge(reachFrom(target, name, stack));
        }
        continue;
      }
      addKind(terminalKind(edge.specifier, target, '*'));
      if (target) merge(reachModule(target, stack));
    }
  } else {
    for (const star of module.starExports) {
      if (star.target) merge(reachFrom(star.target, symbol, stack));
    }
  }

  stack.delete(key);
  if (result.complete) reachCache.set(key, result);
  return result;
}

const moduleCache = new Map();
const walkingModules = new Set();

function reachModule(file, stack) {
  if (moduleCache.has(file)) return moduleCache.get(file);
  if (walkingModules.has(file)) return { gate: false, kinds: new Set(), complete: false };
  walkingModules.add(file);
  const result = { gate: false, kinds: new Set(), complete: true };
  for (const name of analyzeModule(file).exportNames) {
    const from = reachFrom(file, name, stack);
    if (from.gate) result.gate = true;
    for (const kind of from.kinds) result.kinds.add(kind);
    if (!from.complete) result.complete = false;
  }
  walkingModules.delete(file);
  if (result.complete) moduleCache.set(file, result);
  return result;
}

export function routeFiles(root = ROUTE_DIR) {
  if (!fs.existsSync(root)) return [];
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'route.ts') found.push(full);
    }
  };
  walk(root);
  return found.sort();
}

export function classifyRoute(file) {
  const module = analyzeModule(file);
  const handlers = [...module.exportNames].filter((name) => HANDLERS.has(name));
  const combined = { gate: false, kinds: new Set() };
  for (const handler of handlers) {
    const from = reachFrom(file, handler, new Set());
    if (from.gate) combined.gate = true;
    for (const kind of from.kinds) combined.kinds.add(kind);
  }
  if (combined.gate) return 'gated';
  if (combined.kinds.has('user')) return 'ungated-user';
  if (combined.kinds.has('machine')) return 'machine';
  return 'public';
}

/** The vocabulary is only worth anything while every module in it still exists. */
function checkVocabulary(failures) {
  const declared = [
    ...USER_PRINCIPALS.map(([module]) => module),
    ...MACHINE_PRINCIPALS.map(([module]) => module),
    ...IDENTIFICATION_ONLY.keys(),
  ];
  for (const module of declared) {
    if (!module.startsWith('apps/') && !module.startsWith('packages/')) continue;
    if (!fs.existsSync(path.join(scanRoot, module))) {
      failures.push(`the principal vocabulary names ${module}, which no longer exists`);
    }
  }
  for (const [module, reason] of IDENTIFICATION_ONLY) {
    if (reason.length < 25) {
      failures.push(`${module} is treated as identification-only with no reason worth reading`);
    }
  }
}

function main() {
  const failures = [];
  checkVocabulary(failures);

  const contract = fs.existsSync(CONTRACT) ? JSON.parse(fs.readFileSync(CONTRACT, 'utf8')) : {};
  const declaredFor = new Map();
  for (const group of DECLARED_CLASSES) {
    for (const [route, reason] of Object.entries(contract[group] ?? {})) {
      if (declaredFor.has(route)) {
        failures.push(`${route} is declared twice in ${relative(CONTRACT)}`);
      }
      declaredFor.set(route, { group, reason });
    }
  }

  const tally = { gated: [], public: [], machine: [], 'ungated-user': [], sessionLifecycle: [] };
  const analysed = new Map();
  for (const file of routeFiles()) {
    const route = relative(file);
    const found = classifyRoute(file);
    analysed.set(route, found);
    const declared = declaredFor.get(route);

    if (declared?.group === 'sessionLifecycle' && found !== 'gated') {
      tally.sessionLifecycle.push(route);
      continue;
    }
    tally[found].push(route);

    if (found === 'gated') {
      if (declared) {
        failures.push(
          `${route} reaches ${GATE_SYMBOL} and is still declared ${declared.group}; drop the entry`,
        );
      }
      continue;
    }
    if (!declared) {
      failures.push(
        found === 'ungated-user'
          ? `${route} authenticates a user and never reaches ${GATE_SYMBOL}`
          : `${route} is ${found} and is not declared in ${relative(CONTRACT)}`,
      );
      continue;
    }
    if (declared.group !== found) {
      failures.push(
        `${route} is declared ${declared.group} and authenticates a ${found} principal now`,
      );
    }
  }

  for (const [route, { group, reason }] of declaredFor) {
    if (!analysed.has(route)) {
      failures.push(`${relative(CONTRACT)} declares ${route} as ${group}; that route is gone`);
      continue;
    }
    if (typeof reason !== 'string' || reason.length < 25) {
      failures.push(`${route} is declared ${group} with no reason worth reading`);
    }
  }

  if (explain) {
    for (const group of Object.keys(tally)) {
      for (const route of tally[group]) console.log(`${group}\t${route}`);
    }
  }

  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.log(
    `[route account gate] ${tally.gated.length} gated, ${tally.public.length} public, ${tally.machine.length} machine, ${tally.sessionLifecycle.length} session-lifecycle, ${tally['ungated-user'].length} ungated-user, ${failures.length} failure(s)`,
  );
  process.exitCode = failures.length === 0 ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
