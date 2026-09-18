import type { MeasuredRunLike } from './promotion-gate.mjs';

export type CertificationKind = 'model' | 'route';

export type RequirementSource = 'computed' | 'attested';

export interface CertificationSubject {
  readonly kind: CertificationKind;
  readonly modelKey?: string;
  readonly routeId?: string;
}

export interface Attestation {
  readonly by: string;
  readonly on: string;
  readonly evidence: string;
}

export interface CertificationRecord {
  readonly schemaVersion: number;
  readonly subject: CertificationSubject;
  readonly referenceRouteId?: string;
  readonly routingProfiles?: readonly string[];
  readonly attestations?: Readonly<Record<string, Attestation>>;
}

export interface RequirementResult {
  readonly id: string;
  readonly label: string;
  readonly source: RequirementSource;
  readonly passed: boolean;
  readonly detail: string;
}

export interface CertificationVerdict {
  readonly passed: boolean;
  readonly subject: CertificationSubject;
  readonly checklist: string;
  readonly refusals: readonly string[];
  readonly results: readonly RequirementResult[];
}

export interface RequirementDefinition {
  readonly id: string;
  readonly label: string;
  readonly source: RequirementSource;
}

export interface RegistrySlice {
  readonly models?: Readonly<Record<string, unknown>>;
  readonly routes?: Readonly<Record<string, Record<string, unknown>>>;
  readonly capabilities?: Readonly<Record<string, Readonly<Record<string, boolean | null>>>>;
  readonly limits?: Readonly<Record<string, Record<string, number | null>>>;
  readonly harnesses?: Readonly<Record<string, Record<string, unknown>>>;
  readonly governance?: Readonly<Record<string, Record<string, unknown>>>;
  readonly policies?: Record<string, unknown>;
}

export const CERTIFICATIONS_DIR: string;
export const REGISTRY_FILE: string;
export const MODEL_CHECKLIST: string;
export const ROUTE_CHECKLIST: string;
export const REQUIREMENTS: Readonly<Record<CertificationKind, readonly RequirementDefinition[]>>;
export const CHECKLISTS: Readonly<Record<CertificationKind, string>>;

export function routingProfileEligibility(registry: RegistrySlice, modelKey: string): string[];
export function compareRoutes(
  reference: MeasuredRunLike,
  candidate: MeasuredRunLike,
  tolerance: { readonly scoreDrop: number },
): string[];
export function certificationFileName(subject: CertificationSubject): string;
export function measurementKeyFor(subject: CertificationSubject, registry: RegistrySlice): string;
export function addedSubjects(
  baseRegistry: RegistrySlice,
  headRegistry: RegistrySlice,
): CertificationSubject[];
export function evaluateCertification(options: {
  readonly subject: CertificationSubject;
  readonly registry: RegistrySlice;
  readonly certificationsDir?: string;
  readonly measurementsDir?: string;
  readonly tolerance?: { readonly scoreDrop: number };
}): CertificationVerdict;
