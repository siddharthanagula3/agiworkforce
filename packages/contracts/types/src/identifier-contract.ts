/**
 * @file identifier-contract.ts
 * @module @agiworkforce/types/identifier-contract
 *
 * What a product identifier may and may not be. The rules are data rather than
 * prose because `scripts/check-identifier-discipline.mjs` reads every primary
 * key out of the migration history and applies them, so a key that encodes a
 * name, an address, a secret, a filename, a position or another system's id
 * fails the build rather than being caught in review.
 */

import identifierContractJson from './identifier-contract.json' with { type: 'json' };

export interface ForbiddenKeyRule {
  readonly name: string;
  readonly match: string;
  readonly why: string;
}

export interface PositionalIdentifierPattern {
  readonly name: string;
  readonly match: string;
}

export interface SequentialKeyRecord {
  readonly table: string;
  readonly why: string;
}

export interface MintedElsewhereRecord {
  readonly table: string;
  readonly mintedBy: string;
}

export interface IdentifierContract {
  readonly forbiddenKeyColumns: readonly ForbiddenKeyRule[];
  readonly positionalIdentifierPatterns: readonly PositionalIdentifierPattern[];
  readonly sequentialKeys: readonly SequentialKeyRecord[];
  readonly mintedElsewhereKeys: readonly MintedElsewhereRecord[];
  readonly keylessTables: ReadonlyArray<{ readonly table: string; readonly why: string }>;
  readonly forbiddenKeyExemptions: ReadonlyArray<{
    readonly table: string;
    readonly rule: string;
    readonly why: string;
  }>;
  readonly positionalExemptions: ReadonlyArray<{
    readonly file: string;
    readonly pattern: string;
    readonly why: string;
  }>;
}

export const IDENTIFIER_CONTRACT = identifierContractJson as unknown as IdentifierContract;

/** Why a candidate is not usable as an identifier, or null when it is. */
export function forbiddenIdentifierReason(column: string): string | null {
  for (const rule of IDENTIFIER_CONTRACT.forbiddenKeyColumns) {
    if (new RegExp(rule.match).test(column)) return rule.why;
  }
  return null;
}

export function isUsableIdentifierColumn(column: string): boolean {
  return forbiddenIdentifierReason(column) === null;
}

/** A table whose id is minted by something other than the database default. */
export function identifierMintedBy(table: string): string | null {
  return (
    IDENTIFIER_CONTRACT.mintedElsewhereKeys.find((entry) => entry.table === table)?.mintedBy ?? null
  );
}

export function isSequentialKeyTable(table: string): boolean {
  return IDENTIFIER_CONTRACT.sequentialKeys.some((entry) => entry.table === table);
}
