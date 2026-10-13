import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { digest, SOURCE_OBLIGATIONS } from '../../../../scripts/public-runtime/proof.mjs';
import { directoryRecordPath } from '../../app/connectors/mcp-directory/directory-public';
import type { PublicRuntimeFixtures } from './public-runtime-fixtures';
import type {
  PublicRouteCase,
  PublicRouteInventory,
  PublicRouteStateInput,
} from './public-route-inventory';

const ROOT = path.resolve(__dirname, '../../../..');
const RESTING_NAVIGATION = new Set([
  '/',
  '/apps',
  '/connectors',
  '/docs',
  '/features/plugins',
  '/help',
  '/plugins',
  '/skills',
  '/sla',
  '/status',
  '/trial/cancel',
]);

export interface PublicRuntimeCase extends PublicRouteCase {
  stateId: string;
  state?: string;
  dataAccess?: PublicRouteStateInput['dataAccess'];
  expectedNotFoundUi?: boolean;
  expectedRobots?: 'noindex' | null;
  needsRuntimeProof: boolean;
  executionRequired: boolean;
  renderRuntime: 'server' | 'browser';
  renderSource: { file: string; startLine: number; endLine: number; sourceDigest: string };
  requiredTable?: string;
  requiredParameters?: string[];
  heading?: string;
  contentMarker?: string;
  clientMarker?: string;
}

function renderSource(file: string, required: boolean) {
  const content = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const declaration = source.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      Boolean(
        statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword),
      ),
  );
  if (!declaration?.body && required)
    throw new Error(`Runtime proof needs an explicit render entry in ${file}`);
  const client = source.statements.some(
    (statement) =>
      ts.isExpressionStatement(statement) &&
      ts.isStringLiteral(statement.expression) &&
      statement.expression.text === 'use client',
  );
  return {
    renderRuntime: client ? ('browser' as const) : ('server' as const),
    renderSource: {
      file: path.relative(ROOT, file).split(path.sep).join('/'),
      startLine: declaration
        ? source.getLineAndCharacterOfPosition(declaration.getStart(source)).line
        : 0,
      endLine: declaration ? source.getLineAndCharacterOfPosition(declaration.end).line : 0,
      sourceDigest: digest(content),
    },
  };
}

export function publicRuntimeCases(
  inventory: PublicRouteInventory,
  fixtures: PublicRuntimeFixtures,
): PublicRuntimeCase[] {
  const sourceCache = new Map<string, ReturnType<typeof renderSource>>();
  const annotate = (
    route: PublicRouteCase,
    extra: Partial<PublicRuntimeCase> = {},
  ): PublicRuntimeCase => {
    const file =
      route.sourceFiles.find((candidate) => !candidate.includes('/@')) ?? route.sourceFiles[0];
    if (!file) throw new Error(`Missing source for ${route.path}`);
    let source = sourceCache.get(file);
    const executionRequired = route.unresolvedFlags.some((flag) =>
      SOURCE_OBLIGATIONS.includes(flag),
    );
    if (!source) {
      source = renderSource(file, executionRequired || route.expectedHttpStatuses === null);
      sourceCache.set(file, source);
    }
    return {
      ...route,
      ...source,
      stateId: digest([route.path, extra.state ?? 'resting', source.renderSource.sourceDigest]),
      needsRuntimeProof: executionRequired || route.expectedHttpStatuses === null,
      executionRequired,
      ...extra,
    };
  };
  const fixed = inventory.routes.map((route) => {
    if (route.expectedHttpStatuses !== null) return annotate(route);
    if (!RESTING_NAVIGATION.has(route.path))
      throw new Error(`No signed-out resting navigation contract for ${route.path}`);
    return annotate(route, { expectedHttpStatuses: [200], expectedFinalPath: route.path });
  });
  const successful = new Map<string, Partial<PublicRuntimeCase>>([
    [
      '/connectors/mcp-directory/[...id]',
      {
        path: directoryRecordPath(fixtures.connector.id),
        heading: fixtures.connector.name,
        contentMarker: fixtures.connector.description,
        requiredTable: 'mcp_response_cache',
        requiredParameters: [fixtures.snapshotKey.method, fixtures.snapshotKey.params],
      },
    ],
    [
      '/plugins/[id]',
      {
        path: `/plugins/${fixtures.plugin.id}`,
        heading: fixtures.plugin.name,
        contentMarker: fixtures.plugin.description,
        requiredTable: 'plugin_registry_entries',
        requiredParameters: [fixtures.plugin.id],
      },
    ],
    [
      '/share/[token]',
      {
        path: `/share/${fixtures.session.token}`,
        heading: fixtures.session.title,
        contentMarker: fixtures.session.messages[0]!.content,
        requiredTable: 'shared_sessions',
        requiredParameters: [fixtures.session.token],
        expectedRobots: 'noindex',
      },
    ],
    [
      '/share/schedules/[token]',
      {
        path: `/share/schedules/${fixtures.schedule.token}`,
        heading: fixtures.schedule.snapshot.name,
        contentMarker: fixtures.schedule.snapshot.prompt,
        requiredTable: 'scheduled_task_shares',
        requiredParameters: [fixtures.schedule.token],
        expectedRobots: 'noindex',
      },
    ],
    [
      '/shared-artifact/[token]',
      {
        path: `/shared-artifact/${fixtures.artifact.token}`,
        heading: fixtures.artifact.title,
        contentMarker: fixtures.artifact.content,
        requiredTable: 'published_artifacts',
        requiredParameters: [fixtures.artifact.token],
        expectedRobots: 'noindex',
      },
    ],
  ]);
  const samples = inventory.stateSamples.map((sample) => {
    const owner = [...inventory.unresolvedDynamic, ...inventory.unavailableDynamic].find(
      (candidate) => candidate.pattern === sample.pattern,
    );
    if (!owner) throw new Error(`Runtime state lacks an inventory owner: ${sample.pattern}`);
    const fixture =
      sample.dataAccess === 'fixture-required' ? successful.get(sample.pattern) : null;
    if (sample.dataAccess === 'fixture-required' && !fixture?.path)
      throw new Error(`Successful content has no fixture: ${sample.pattern}`);
    const routePath = fixture?.path ?? sample.path;
    if (!routePath) throw new Error(`No concrete runtime state for ${sample.pattern}`);
    return annotate(
      {
        ...sample,
        route: routePath,
        path: routePath,
        kind: 'generated',
        sourceFiles: owner.sourceFiles,
      },
      {
        ...sample,
        ...fixture,
        path: routePath,
        route: routePath,
        expectedHttpStatuses: fixture ? [200] : sample.expectedHttpStatuses,
        expectedFinalPath: fixture ? routePath : sample.expectedFinalPath,
        clientMarker:
          sample.state === 'unknown-device'
            ? 'agi-connect-unknown-title'
            : sample.state === 'device-sign-in-instructions'
              ? 'agi-connect-device-title'
              : undefined,
      },
    );
  });
  const result = [...fixed, ...samples];
  if (
    new Set(result.map((route) => route.path)).size !== result.length ||
    result.some((route) => route.expectedHttpStatuses === null || route.expectedFinalPath === null)
  ) {
    throw new Error('Runtime cases are incomplete or duplicated');
  }
  return result;
}
