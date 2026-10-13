import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { PublicRuntimeContainers } from '../../../../scripts/public-runtime/containers.mjs';
import { withPublicRuntimeCleanup } from '../../../../scripts/public-runtime/lifecycle.mjs';
import { digest, PROOF_VERSION } from '../../../../scripts/public-runtime/proof.mjs';
import { getPublicRouteInventory } from '../lib/public-route-inventory';
import { publicRuntimeFixtures } from '../lib/public-runtime-fixtures';
import { publicRuntimeCases } from '../lib/public-runtime-cases';
import { assertPublicRuntimeState, startBrowserObservation } from '../lib/public-runtime-browser';
import { settlePublicPage } from '../lib/public-page-readiness';
import { startPublicRuntimeFailureDiagnostics } from '../lib/public-runtime-failure-diagnostics';

test('cold public runtime proof', async ({ browser }, testInfo) => {
  const revision = process.env['GITHUB_SHA'];
  const image = process.env['PUBLIC_RUNTIME_IMAGE'];
  const postgresImage = process.env['PUBLIC_RUNTIME_POSTGRES_IMAGE'];
  const destination = process.env['PUBLIC_RUNTIME_PROOF_ARTIFACT'];
  if (!revision || !image || !postgresImage || !destination)
    throw new Error(
      'Cold proof requires an image, PostgreSQL image, exact revision and artifact destination',
    );
  const fixtures = publicRuntimeFixtures();
  const inventory = getPublicRouteInventory();
  const scope = process.env['PUBLIC_RUNTIME_PROOF_MODE'] ?? 'full';
  if (!['full', 'canary'].includes(scope)) throw new Error('Unknown public proof scope');
  const allCases = publicRuntimeCases(inventory, fixtures).filter(
    (route) => route.needsRuntimeProof,
  );
  const cases =
    scope === 'full'
      ? allCases
      : allCases.filter(
          (route) =>
            (route.pattern === '/share/[token]' &&
              ['successful-content', 'not-found'].includes(route.state ?? '')) ||
            (route.pattern === '/connect/[deviceType]' && route.state === 'unknown-device'),
        );
  if (scope === 'canary') expect(cases).toHaveLength(3);
  expect(cases.length).toBeGreaterThan(0);
  test.setTimeout((cases.length + 5) * 120_000);
  const harness = new PublicRuntimeContainers({
    root: path.resolve(__dirname, '../../../..'),
    image,
    postgresImage,
    fixtures,
    revision,
    evidenceDirectory: path.join(path.dirname(destination), 'evidence'),
  });
  let complete = false;
  let snapshot;
  await withPublicRuntimeCleanup(
    async () => {
      await harness.initialize();
      for (const route of cases) {
        const handle = await harness.startCase(route);
        const context = await browser.newContext({
          baseURL: handle.origin,
          viewport: { width: 1280, height: 900 },
          colorScheme: 'light',
          reducedMotion: 'reduce',
          serviceWorkers: 'block',
          storageState: { cookies: [], origins: [] },
        });
        let browserDiagnostics: ReturnType<typeof startPublicRuntimeFailureDiagnostics> | undefined;
        await withPublicRuntimeCleanup(
          async () => {
            try {
              const page = await context.newPage();
              browserDiagnostics = startPublicRuntimeFailureDiagnostics(page, handle.origin);
              const observation = await startBrowserObservation(page, route, handle.origin);
              const location = new URL(route.path, handle.origin);
              const readiness = await settlePublicPage(
                page,
                { ...route, expectedOrigin: location.origin, expectedQuery: location.search },
                { expectedFonts: [{ cssVariable: '--font-geist-sans' }] },
              );
              await assertPublicRuntimeState(page, route);
              const browserProof = await observation.finish();
              const proof = await harness.finishCase(
                handle,
                {
                  settled: true,
                  stateMatched: true,
                  readiness,
                  clientExecution: browserProof.clientExecution,
                  browserObservationLimits: browserProof.limits,
                },
                { coverage: browserProof.coverage, httpRequests: browserProof.httpRequests },
              );
              const receiptName = `evidence/${proof.stateId}.json.gz`;
              if (!/^[a-f0-9]{64}$/.test(proof.stateId) || proof.evidence.filename !== receiptName)
                throw new Error('Candidate runtime evidence has an invalid state-bound path');
              const receipt = readFileSync(path.join(path.dirname(destination), receiptName));
              if (digest(receipt) !== proof.evidence.digest)
                throw new Error('Candidate runtime receipt digest changed');
              await testInfo.attach(`runtime-candidate-${proof.stateId}.json`, {
                body: JSON.stringify({
                  ...proof,
                  failureOnly: true,
                  caseIndex: handle.index,
                  teardownComplete: false,
                  limits: [
                    'Lifecycle teardown and proof sealing are incomplete; this candidate is not a passing runtime proof.',
                  ],
                }),
                contentType: 'application/json',
              });
              await testInfo.attach(`runtime-raw-${proof.stateId}.json.gz`, {
                body: receipt,
                contentType: 'application/gzip',
              });
              expect(proof.document).toEqual(browserProof.document);
            } catch (error) {
              let diagnostics;
              try {
                diagnostics = await harness.caseFailureDiagnostics(handle);
              } catch (diagnosticError) {
                diagnostics = {
                  failureOnly: true,
                  stateId: handle.state.stateId,
                  error: String(diagnosticError),
                };
              }
              const browserEvidence = browserDiagnostics
                ? await browserDiagnostics.capture(1000)
                : null;
              try {
                await testInfo.attach(`runtime-failure-${handle.state.stateId}.json`, {
                  body: JSON.stringify({ ...diagnostics, browser: browserEvidence }),
                  contentType: 'application/json',
                });
              } catch (attachmentError) {
                testInfo.annotations.push({
                  type: 'runtime-failure-diagnostics-unavailable',
                  description: String(attachmentError),
                });
              }
              throw error;
            }
          },
          async () => {
            browserDiagnostics?.dispose();
            await context.close();
          },
        );
      }
      mkdirSync(path.dirname(destination), { recursive: true });
      snapshot = await harness.exportSnapshot(
        path.join(path.dirname(destination), 'template.dump'),
      );
      complete = true;
    },
    () => harness.close(),
  );
  if (!complete) throw new Error('Cold runtime proof did not complete');
  for (const proof of harness.proofs)
    await testInfo.attach(`runtime-${proof.stateId}.json`, {
      body: JSON.stringify(proof),
      contentType: 'application/json',
    });
  const artifact = {
    version: PROOF_VERSION,
    scope,
    revision,
    imageId: harness.imageId,
    buildId: harness.buildId,
    runId: harness.runId,
    fixtureDigest: digest(fixtures),
    fixtures,
    snapshot,
    postgresImageId: harness.postgresImageId,
    migrationDigest: harness.migrationDigest,
    proofs: harness.proofs,
  };
  writeFileSync(destination, JSON.stringify(artifact, null, 2) + '\n');
});
