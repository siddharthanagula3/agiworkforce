/**
 * The artifacts package's own derivation, loaded by relative path at runtime.
 *
 * Whether an answer's block becomes an artifact is decided by the same
 * `deriveArtifacts` and explicit-derivation policy the product applies to a
 * saved turn, and the markers the chat prompt names come from the same map,
 * so a grader can never pass a block the product would leave as plain code.
 *
 * @module evals/artifacts-package
 * @packageDocumentation
 */

import { fileURLToPath, pathToFileURL } from 'node:url';

const DERIVATION_MODULE = fileURLToPath(
  new URL('../../../packages/platform/artifacts/src/artifact-derivation.ts', import.meta.url),
);

export interface DerivedArtifact {
  readonly type: string;
  readonly content: string;
}

export interface ArtifactsPackage {
  readonly EXPLICIT_ARTIFACT_DERIVATION_POLICY: string;
  readonly EXPLICIT_ARTIFACT_MARKER_FOR: Readonly<Record<string, string>>;
  readonly artifactInclusionForPolicy: (policy: unknown) => unknown;
  readonly deriveArtifacts: (
    markdown: string,
    options: { readonly include?: unknown },
  ) => readonly DerivedArtifact[];
}

let loaded: Promise<ArtifactsPackage> | undefined;

export function loadArtifactsPackage(): Promise<ArtifactsPackage> {
  loaded ??= import(pathToFileURL(DERIVATION_MODULE).href) as Promise<ArtifactsPackage>;
  return loaded;
}

export async function explicitArtifacts(markdown: string): Promise<readonly DerivedArtifact[]> {
  const artifacts = await loadArtifactsPackage();
  return artifacts.deriveArtifacts(markdown, {
    include: artifacts.artifactInclusionForPolicy(artifacts.EXPLICIT_ARTIFACT_DERIVATION_POLICY),
  });
}
